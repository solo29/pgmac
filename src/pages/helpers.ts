export const maybeQuoteIdentifier = (name: string): string => {
  const needsQuotes =
    /[A-Z]/.test(name) || // Has caps
    /[^a-z0-9_]/.test(name) || // Has special chars
    /^[0-9]/.test(name) || // Starts with digit
    [
      "select",
      "from",
      "where",
      "table",
      "order",
      "group",
      "by",
      "limit",
      "offset",
      "insert",
      "update",
      "delete",
      "create",
      "alter",
      "drop",
      "grant",
      "revoke",
      "all",
      "distinct",
      "as",
      "join",
      "on",
      "inner",
      "outer",
      "left",
      "right",
      "full",
      "union",
      "except",
      "intersect",
      "user",
    ].includes(name.toLowerCase());

  return needsQuotes ? `"${name}"` : name;
};
