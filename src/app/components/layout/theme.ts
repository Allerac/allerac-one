export type Theme = typeof DARK;

// Matches the Tailwind gray-900 + indigo palette used in ChatClient / health / social domains
export const DARK = {
  bg:           '#111827', // gray-900  — full-page background
  surface:      '#1f2937', // gray-800  — active items, elevated cards, input bg
  hover:        '#1f2937', // gray-800  — hover states
  border:       '#1f2937', // gray-800  — subtle separators
  text:         '#f3f4f6', // gray-100
  textMuted:    '#d1d5db', // gray-300
  textFaint:    '#6b7280', // gray-500
  accent:       '#4f46e5', // indigo-600
  accentText:   '#ffffff',
  input:        '#374151', // gray-700
  danger:       '#f87171', // red-400
  success:      '#4ade80', // green-400
  msgUser:      '#312e81', // indigo-900 (user bubble)
  msgAssistant: '#1f2937', // gray-800  (assistant bubble)
};

export const LIGHT: Theme = {
  bg:           '#f9fafb', // gray-50
  surface:      '#ffffff', // white
  hover:        '#f3f4f6', // gray-100
  border:       '#e5e7eb', // gray-200
  text:         '#111827', // gray-900
  textMuted:    '#4b5563', // gray-600
  textFaint:    '#9ca3af', // gray-400
  accent:       '#4f46e5', // indigo-600
  accentText:   '#ffffff',
  input:        '#f3f4f6', // gray-100
  danger:       '#dc2626', // red-600
  success:      '#16a34a', // green-600
  msgUser:      '#eef2ff', // indigo-50
  msgAssistant: '#f9fafb', // gray-50
};
