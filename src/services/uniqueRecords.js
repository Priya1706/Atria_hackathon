export function uniqueByStableId(records, recordType) {
  const unique = new Map();
  for (const record of records) {
    if (typeof record?.id !== "string" || !record.id.trim()) {
      throw new Error(`${recordType} response included a record without a stable ID.`);
    }
    // Repeated API rows with the same identity collapse to one item. Distinct IDs
    // remain visible even when their descriptions happen to be similar.
    if (!unique.has(record.id)) unique.set(record.id, record);
  }
  return [...unique.values()];
}
