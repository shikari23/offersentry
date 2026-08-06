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
