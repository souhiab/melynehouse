export const sheetEventType = 'melyne.cod_order.created';

export function creationEvent({ eventId, orderId, orderNumber, createdAt, source, customer, note, totalMad, items }) {
  return {
    eventId, eventType: sheetEventType, schemaVersion: 1,
    order: { id: orderId, orderNumber, createdAt, status: 'new', source, currency: 'MAD',
      customer, note: note || null, subtotalMad: totalMad, totalMad, items },
  };
}

// Validate only the acknowledgement schema; no arbitrary remote response is stored.
export function verifiedReceipt(value, event) {
  if (!value || value.schemaVersion !== 1 || value.eventId !== event.eventId || value.orderId !== event.order.id
    || !['persisted', 'already_persisted'].includes(value.result)
    || typeof value.receiptId !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value.receiptId)
    || typeof value.persistedAt !== 'string' || !Number.isFinite(Date.parse(value.persistedAt))) return null;
  return { schemaVersion: 1, eventId: value.eventId, orderId: value.orderId, result: value.result,
    receiptId: value.receiptId, persistedAt: value.persistedAt };
}
