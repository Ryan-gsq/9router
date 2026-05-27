function isEmptyValue(value) {
  return value === undefined || value === null || value === "";
}

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

function cloneBody(body) {
  if (!isObjectLike(body)) return body;
  return JSON.parse(JSON.stringify(body));
}

function parsePath(path) {
  if (typeof path !== "string") return [];
  return path.split(".").map((part) => part.trim()).filter(Boolean);
}

function isArrayIndex(part) {
  return /^\d+$/.test(part);
}

function findHeaderKey(headers, key) {
  const target = String(key || "").toLowerCase();
  return Object.keys(headers || {}).find((headerKey) => headerKey.toLowerCase() === target);
}

export function getValueByPath(object, path) {
  const parts = parsePath(path);
  if (!parts.length) return undefined;
  let current = object;
  for (const part of parts) {
    if (!isObjectLike(current)) return undefined;
    const key = Array.isArray(current) && isArrayIndex(part) ? Number(part) : part;
    current = current[key];
  }
  return current;
}

export function setValueByPath(object, path, value) {
  const parts = parsePath(path);
  if (!parts.length || !isObjectLike(object)) return object;
  let current = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const key = Array.isArray(current) && isArrayIndex(part) ? Number(part) : part;
    const nextPart = parts[index + 1];
    if (!isObjectLike(current[key])) {
      current[key] = isArrayIndex(nextPart) ? [] : {};
    }
    current = current[key];
  }
  const lastPart = parts[parts.length - 1];
  const lastKey = Array.isArray(current) && isArrayIndex(lastPart) ? Number(lastPart) : lastPart;
  current[lastKey] = value;
  return object;
}

export function deleteByPath(object, path) {
  const parts = parsePath(path);
  if (!parts.length || !isObjectLike(object)) return object;
  let current = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const key = Array.isArray(current) && isArrayIndex(part) ? Number(part) : part;
    if (!isObjectLike(current[key])) return object;
    current = current[key];
  }
  const lastPart = parts[parts.length - 1];
  if (Array.isArray(current) && isArrayIndex(lastPart)) {
    const index = Number(lastPart);
    if (index >= 0 && index < current.length) current.splice(index, 1);
    return object;
  }
  delete current[lastPart];
  return object;
}

function applyHeaderRule(headers, rule) {
  const actualKey = findHeaderKey(headers, rule.key);
  const headerKey = actualKey || rule.key;
  if (!headerKey) return;
  if (rule.mode === "block") {
    if (actualKey) delete headers[actualKey];
    return;
  }
  if (rule.mode === "default") {
    if (!actualKey || isEmptyValue(headers[actualKey])) headers[headerKey] = rule.value;
    return;
  }
  if (rule.mode === "override") headers[headerKey] = rule.value;
}

function applyBodyRule(body, rule) {
  if (!isObjectLike(body)) return;
  if (rule.mode === "block") {
    deleteByPath(body, rule.key);
    return;
  }
  if (rule.mode === "default") {
    if (isEmptyValue(getValueByPath(body, rule.key))) setValueByPath(body, rule.key, rule.value);
    return;
  }
  if (rule.mode === "override") setValueByPath(body, rule.key, rule.value);
}

export function applyRequestRewriteRules({ headers, body, credentials }) {
  const rules = credentials?.providerSpecificData?.providerRequestTransforms?.rules || [];
  if (!Array.isArray(rules) || rules.length === 0) {
    return { headers, body };
  }

  const rewrittenHeaders = { ...(headers || {}) };
  const rewrittenBody = cloneBody(body);

  for (const rule of rules) {
    if (!rule?.key || !["default", "override", "block"].includes(rule.mode)) continue;
    if (rule.target === "body") {
      applyBodyRule(rewrittenBody, rule);
    } else {
      applyHeaderRule(rewrittenHeaders, rule);
    }
  }

  return { headers: rewrittenHeaders, body: rewrittenBody };
}
