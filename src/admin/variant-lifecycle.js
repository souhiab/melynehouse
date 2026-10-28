export const selectionSignature = (selections) => selections
  .map((selection) => `${String(selection.optionKey || selection.option).toLowerCase()}=${selection.value}`)
  .sort()
  .join("|");

export function optionValuesFromText(text, existingValues = [], idPrefix = "owner-value") {
  const labels = [...new Set(text.split(",").map((value) => value.trim()).filter(Boolean))];
  return labels.map((label, index) => existingValues.find((value) => value.label === label || value.label.trim() === label) || {
    id: `${idPrefix}-${index}`,
    label,
    secondaryLabel: label,
  });
}

export function buildVariants(options, previous, priceMad, comparisonPriceMad) {
  const active = options.filter((option) => Array.isArray(option.values) && option.values.length);
  const combinations = active.length ? active.reduce(
    (sets, option) => sets.flatMap((set) => option.values.map((value) => [...set, {
      option: option.name,
      optionKey: option.key || option.name,
      value: value.label,
    }])),
    [[]],
  ) : [];
  const existing = new Map(previous.map((variant) => [selectionSignature(variant.selections), variant]));
  const currentSignatures = new Set(combinations.map(selectionSignature));
  const current = combinations.map((selections) => {
    const match = existing.get(selectionSignature(selections));
    return match ? { ...match, selections, name: selections.map((selection) => `${selection.option} : ${selection.value}`).join(" | ") } : {
      name: selections.map((selection) => `${selection.option} : ${selection.value}`).join(" | "),
      selections,
      priceMad: Number(priceMad || 0),
      comparisonPriceMad: comparisonPriceMad === "" || comparisonPriceMad == null ? null : Number(comparisonPriceMad),
      stockQuantity: null,
      available: true,
      retired: false,
      imageId: null,
    };
  });
  return [...current, ...previous.filter((variant) => !currentSignatures.has(selectionSignature(variant.selections))).map((variant) => ({ ...variant, retired: true, available: false }))];
}
