export type PrivateArchiveCloudE2EEnvironment = Record<string, string | undefined>;

export type PrivateArchiveCloudE2EConfig = {
  apiBaseUrl: string;
  email: string;
  password: string;
};

const ISOLATED_FIXTURE_CONFIRMATION = "I_CONFIRM_ISOLATED_DESTRUCTIVE_FIXTURE";

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;

  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) &&
    Number(octets[0]) === 127
  );
}

function requiredValue(
  environment: PrivateArchiveCloudE2EEnvironment,
  key: string,
) {
  const value = environment[key];
  if (!value?.trim()) throw new Error(`Missing required setting: ${key}`);
  return value;
}

export function resolvePrivateArchiveCloudE2EConfig(
  environment: PrivateArchiveCloudE2EEnvironment,
): PrivateArchiveCloudE2EConfig {
  const rawApiUrl = requiredValue(environment, "PRIVATE_ARCHIVE_CLOUD_API_URL");
  const email = requiredValue(
    environment,
    "PRIVATE_ARCHIVE_CLOUD_E2E_SYNTHETIC_EMAIL",
  );
  const password = requiredValue(
    environment,
    "PRIVATE_ARCHIVE_CLOUD_E2E_SYNTHETIC_PASSWORD",
  );
  const confirmation = requiredValue(
    environment,
    "PRIVATE_ARCHIVE_CLOUD_E2E_CONFIRM",
  );

  let apiUrl: URL;
  try {
    apiUrl = new URL(rawApiUrl);
  } catch (_error) {
    throw new Error("PRIVATE_ARCHIVE_CLOUD_API_URL must be a valid URL");
  }

  if (apiUrl.username || apiUrl.password) {
    throw new Error("PRIVATE_ARCHIVE_CLOUD_API_URL must not contain credentials");
  }
  if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") {
    throw new Error("PRIVATE_ARCHIVE_CLOUD_API_URL must use HTTP or HTTPS");
  }
  if (apiUrl.search || apiUrl.hash) {
    throw new Error("PRIVATE_ARCHIVE_CLOUD_API_URL must not contain query or fragment");
  }
  if (!isLoopbackHostname(apiUrl.hostname)) {
    throw new Error("PRIVATE_ARCHIVE_CLOUD_API_URL must target a loopback host");
  }
  if (confirmation !== ISOLATED_FIXTURE_CONFIRMATION) {
    throw new Error(
      "PRIVATE_ARCHIVE_CLOUD_E2E_CONFIRM must confirm an isolated destructive fixture",
    );
  }

  return {
    apiBaseUrl: apiUrl.href.replace(/\/+$/, ""),
    email,
    password,
  };
}
