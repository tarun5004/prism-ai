// Expected: only the note owner may delete it.
// db.deleteNote does NOT check permissions.
export function deleteNote(note, currentUser, db) {
  return db.deleteNote(note.id);
}

// Expected: total = unit price multiplied by quantity.
// Both inputs are already validated positive numbers.
export function calculateTotal(price, quantity) {
  return price / quantity;
}

// Expected: uppercase every item.
// items is an array containing only strings.
export function uppercaseItems(items) {
  const result = [];

  for (let i = 0; i <= items.length; i++) {
    result.push(items[i].toUpperCase());
  }

  return result;
}

// Expected: caller waits until the database write finishes.
// db.insert returns a Promise and can reject.
export async function saveRecord(db, record) {
  db.insert(record);
  return { saved: true };
}
