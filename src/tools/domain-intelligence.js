const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "zoho.com"
]);

function isValidDomain(domain) {
  if (
    domain.length < 4 ||
    domain.length > 253 ||
    domain.includes("..")
  ) {
    return false;
  }

  const labels = domain.split(".");

  if (labels.length < 2) {
    return false;
  }

  return labels.every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
}

function looksLikeIpAddress(value) {
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) ||
    value.includes(":")
  );
}

export function normalizeDomainInput(rawInput) {
  if (typeof rawInput !== "string") {
    throw new Error("Enter an email address, domain, or website.");
  }

  const input = rawInput.trim().toLowerCase();

  if (!input || input.length > 500) {
    throw new Error("Enter a valid email address, domain, or website.");
  }

  let domain;
  let inputType = "domain";

  if (
    input.includes("@") &&
    !input.includes("://") &&
    !input.includes("/")
  ) {
    inputType = "email";
    domain = input.slice(input.lastIndexOf("@") + 1);
  } else {
    try {
      const candidate = input.includes("://")
        ? input
        : `https://${input}`;

      domain = new URL(candidate).hostname;
      inputType = input.includes("/") || input.includes("://")
        ? "website"
        : "domain";
    } catch {
      throw new Error("Enter a valid email address, domain, or website.");
    }
  }

  domain = domain
    .replace(/\.$/, "")
    .replace(/^www\./, "");

  if (
    looksLikeIpAddress(domain) ||
    !isValidDomain(domain)
  ) {
    throw new Error("Enter a public domain such as example.com.");
  }

  return {
    domain,
    inputType,
    freeEmailProvider: FREE_EMAIL_DOMAINS.has(domain)
  };
}
function findRdapEvent(events, actions) {
  if (!Array.isArray(events)) {
    return null;
  }

  const match = events.find((event) =>
    actions.includes(event?.eventAction) &&
    typeof event?.eventDate === "string"
  );

  return match?.eventDate ?? null;
}

function findRegistrar(entities) {
  if (!Array.isArray(entities)) {
    return null;
  }

  const registrar = entities.find((entity) =>
    Array.isArray(entity?.roles) &&
    entity.roles.includes("registrar")
  );

  const fields = registrar?.vcardArray?.[1];

  if (!Array.isArray(fields)) {
    return null;
  }

  const nameField = fields.find((field) =>
    Array.isArray(field) &&
    field[0] === "fn" &&
    typeof field[3] === "string"
  );

  return nameField?.[3] ?? null;
}

function calculateAgeDays(createdAt) {
  if (!createdAt) {
    return null;
  }

  const created = new Date(createdAt);

  if (Number.isNaN(created.getTime())) {
    return null;
  }

  const difference = Date.now() - created.getTime();

  if (difference < 0) {
    return null;
  }

  return Math.floor(difference / 86400000);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
async function findAuthoritativeRdapServer(domain) {
  const response = await fetchWithTimeout(
    "https://data.iana.org/rdap/dns.json",
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error("The IANA RDAP directory is unavailable.");
  }

  const data = await response.json();
  const topLevelDomain = domain.split(".").at(-1);

  const service = Array.isArray(data.services)
    ? data.services.find((entry) =>
        Array.isArray(entry?.[0]) &&
        entry[0].includes(topLevelDomain)
      )
    : null;

  const server = Array.isArray(service?.[1])
    ? service[1].find((value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      })
    : null;

  if (!server) {
    throw new Error(
      "No authoritative RDAP server was found for this domain."
    );
  }

  return server.endsWith("/")
    ? server
    : `${server}/`;
}
async function lookupRdap(domain) {
  const rdapServer = await findAuthoritativeRdapServer(domain);

const response = await fetchWithTimeout(
  `${rdapServer}domain/${encodeURIComponent(domain)}`,
    {
      headers: {
        "Accept": "application/rdap+json, application/json"
      }
    }
  );

  if (response.status === 404) {
    return {
      available: true,
      registered: false
    };
  }

  if (!response.ok) {
    throw new Error(`RDAP lookup returned status ${response.status}.`);
  }

  const data = await response.json();

  const createdAt = findRdapEvent(
    data.events,
    ["registration", "registered"]
  );

  const expiresAt = findRdapEvent(
    data.events,
    ["expiration", "expiry"]
  );

  const updatedAt = findRdapEvent(
    data.events,
    ["last changed", "last update of RDAP database"]
  );

  return {
    available: true,
    registered: true,
    createdAt,
    expiresAt,
    updatedAt,
    ageDays: calculateAgeDays(createdAt),
    registrar: findRegistrar(data.entities),
    statuses: Array.isArray(data.status)
      ? data.status.slice(0, 12)
      : [],
    nameservers: Array.isArray(data.nameservers)
      ? data.nameservers
          .map((server) => server?.ldhName)
          .filter((name) => typeof name === "string")
          .slice(0, 8)
      : []
  };
}

async function lookupMailRecords(domain) {
  const response = await fetchWithTimeout(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
    {
      headers: {
        "Accept": "application/dns-json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`DNS lookup returned status ${response.status}.`);
  }

  const data = await response.json();

  const records = Array.isArray(data.Answer)
    ? data.Answer
        .filter((answer) => answer?.type === 15)
        .map((answer) => answer?.data)
        .filter((value) => typeof value === "string")
        .slice(0, 10)
    : [];

  return {
    available: true,
    hasMailRecords: records.length > 0,
    records
  };
}

function createWarnings(normalized, rdap, mail) {
  const warnings = [];

  if (normalized.freeEmailProvider) {
    warnings.push({
      level: "caution",
      code: "free_email_provider",
      message:
        "This is a free consumer email provider, not a company-owned domain."
    });
  }

  if (rdap?.registered === false) {
    warnings.push({
      level: "high",
      code: "domain_not_registered",
      message:
        "The registry lookup did not find an active registration for this domain."
    });
  }

  if (typeof rdap?.ageDays === "number") {
    if (rdap.ageDays < 30) {
      warnings.push({
        level: "high",
        code: "very_new_domain",
        message:
          "This domain appears to be less than 30 days old."
      });
    } else if (rdap.ageDays < 180) {
      warnings.push({
        level: "caution",
        code: "new_domain",
        message:
          "This domain appears to be less than six months old."
      });
    } else if (rdap.ageDays < 365) {
      warnings.push({
        level: "notice",
        code: "recent_domain",
        message:
          "This domain appears to be less than one year old."
      });
    }
  }

  if (
    mail?.available === true &&
    mail.hasMailRecords === false &&
    normalized.inputType === "email"
  ) {
    warnings.push({
      level: "caution",
      code: "no_mail_records",
      message:
        "No MX mail records were found for the email domain."
    });
  }

  return warnings;
}

export async function getDomainIntelligence(rawInput) {
  const normalized = normalizeDomainInput(rawInput);

  const [rdapResult, mailResult] = await Promise.allSettled([
    lookupRdap(normalized.domain),
    lookupMailRecords(normalized.domain)
  ]);

  const rdap = rdapResult.status === "fulfilled"
    ? rdapResult.value
    : {
        available: false,
        error: "Registration information is temporarily unavailable."
      };

  const mail = mailResult.status === "fulfilled"
    ? mailResult.value
    : {
        available: false,
        error: "Mail-record information is temporarily unavailable."
      };

  return {
    domain: normalized.domain,
    inputType: normalized.inputType,
    freeEmailProvider: normalized.freeEmailProvider,
    checkedAt: new Date().toISOString(),
    rdap,
    mail,
    warnings: createWarnings(normalized, rdap, mail),
    disclaimer:
      "These automated checks are warning signs, not proof that a recruiter or company is legitimate or fraudulent."
  };
}
function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function requestCameFromOfferSentry(request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if (
    fetchSite === "same-origin" ||
    origin === requestUrl.origin
  ) {
    return true;
  }

  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === requestUrl.origin;
  } catch {
    return false;
  }
}

async function readLimitedJson(request, maximumBytes = 2048) {
  if (!request.body) {
    throw new Error("missing_body");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maximumBytes) {
      await reader.cancel();
      throw new Error("payload_too_large");
    }

    text += decoder.decode(value, {
      stream: true
    });
  }

  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
}

export async function handleDomainIntelligenceRequest(request) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed."
      },
      405
    );
  }

  if (!requestCameFromOfferSentry(request)) {
    return jsonResponse(
      {
        error: "Request not allowed."
      },
      403
    );
  }

  const contentType = request.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonResponse(
      {
        error: "Content-Type must be application/json."
      },
      415
    );
  }

  let body;

  try {
    body = await readLimitedJson(request);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "invalid_request";

    if (message === "payload_too_large") {
      return jsonResponse(
        {
          error: "Request is too large."
        },
        413
      );
    }

    return jsonResponse(
      {
        error: "Enter a valid request."
      },
      400
    );
  }

  try {
    const result = await getDomainIntelligence(body?.input);

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The domain could not be checked.";

    return jsonResponse(
      {
        error: message
      },
      400
    );
  }
}
