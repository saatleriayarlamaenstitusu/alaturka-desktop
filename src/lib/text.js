// Turkish casing.
//
// CSS `text-transform: uppercase` maps `i` to `I`, not to `İ` — GTK's CSS
// has no locale to consult. Measured on the prayer-times page: "İmsak
// vaktine" came out as "İMSAK VAKTINE". JavaScript does know the rule, so
// the labels are uppercased here and the stylesheet only sets the letter
// spacing and weight that go with them.

export const upper = (s) => String(s ?? '').toLocaleUpperCase('tr-TR');
