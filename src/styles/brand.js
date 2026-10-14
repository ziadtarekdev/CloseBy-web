// Colours taken from close_by/lib/core/theme/app_colors.dart. The Flutter file is
// the source of truth; these hex values are a copy, not a new identity.
//
// The file's own rule is preserved: a pastel logo dot is for fills, and only a
// *Deep tone carries text or sits on a tinted background.
export const colors = {
  indigo: '#3347BE',
  indigoDeep: '#26338F',
  indigoInk: '#1B2160',
  indigoTint: '#E3E7FA',
  indigoWash: '#F2F4FD',

  sky: '#B6D3FA',
  skyTint: '#E6F0FE',
  skyDeep: '#2A5DA8',

  teal: '#86C6C6',
  tealTint: '#E3F3F3',
  tealDeep: '#1D7373',

  coral: '#FF99A9',
  coralTint: '#FFE9ED',
  coralDeep: '#B8324D',

  yellow: '#FCED89',
  yellowTint: '#FFF8CC',
  yellowDeep: '#7A5F00',

  background: '#F6F7FD',
  surface: '#FFFFFF',
  border: '#E1E4F3',
  borderStrong: '#C9CFEE',
  inkMuted: '#5B6187',
  inkFaint: '#7E85AC',
};

// The four logo dots in logo order, used to colour the avatar so children in
// the same list stay visually distinguishable.
export const avatarDots = [colors.sky, colors.coral, colors.teal, colors.yellow];