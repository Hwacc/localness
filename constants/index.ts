export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  GUEST = 'GUEST',
}

export enum OSSEngine {
  LOCAL = 'LOCAL',
  CLOUDFLARE = 'CLOUDFLARE',
  QINIU = 'QINIU',
}

export const SCALE_OPTIONS = [
  {
    label: '100%',
    value: 1,
  },
  {
    label: '50%',
    value: 0.5,
  },
  {
    label: '125%',
    value: 1.25,
  },
]

export const DEFAULT_CORNER_RADIUS = 4
export const DEFAULT_LINE_WIDTH = 2
export const DEFAULT_LINE_COLOR = '#FEB027'
export const DEFAULT_LABEL_FONT_SIZE = 14
export const DEFAULT_LABEL_FONT_WEIGHT = 'bold'
export const DEFAULT_LABEL_FILL = '#FF0000'
export const DEFAULT_LABEL_WRAP = 'none'
export const DEFAULT_LABEL_ALIGN = 'top-right'

export const WELCOME_TEXTS = [
  'Hello World',
  '你好世界',
  'Hallo Welt',
  'Hola Mundo',
  'Bonjour le monde',
  'Olá mundo',
  'こんにちは世界',
  '안녕하세요 세계',
  'Привет, мир',
]

export const OCR_ENGINES = [
  {
    label: 'Engine1',
    value: 1,
  },
  {
    label: 'Engine2',
    value: 2,
  },
]

export const OCR_LANGUAGES = [
  {
    label: 'Auto',
    value: 'auto',
  },
  {
    label: 'Arabic',
    value: 'ara',
  },
  {
    label: 'Bulgarian',
    value: 'bul',
  },
  {
    label: 'Chinese(Simplified)',
    value: 'chs',
  },
  {
    label: 'Chinese(Traditional)',
    value: 'cht',
  },
  {
    label: 'Croatian',
    value: 'hrv',
  },
  {
    label: 'Czech',
    value: 'cze',
  },
  {
    label: 'Danish',
    value: 'dan',
  },
  {
    label: 'Dutch',
    value: 'dut',
  },
  {
    label: 'English',
    value: 'eng',
  },
  {
    label: 'Finnish',
    value: 'fin',
  },
  {
    label: 'French',
    value: 'fre',
  },
  {
    label: 'German',
    value: 'ger',
  },
  {
    label: 'Greek',
    value: 'gre',
  },
  {
    label: 'Hungarian',
    value: 'hun',
  },
  {
    label: 'Italian',
    value: 'ita',
  },
  {
    label: 'Japanese',
    value: 'jpn',
  },
  {
    label: 'Polish',
    value: 'pol',
  },
  {
    label: 'Portuguese',
    value: 'por',
  },
  {
    label: 'Russian',
    value: 'rus',
  },
  {
    label: 'Slovenian',
    value: 'slv',
  },
  {
    label: 'Spanish',
    value: 'spa',
  },
  {
    label: 'Swedish',
    value: 'swe',
  },
  {
    label: 'Thai',
    value: 'tha',
  },
  {
    label: 'Turkish',
    value: 'tur',
  },
  {
    label: 'Ukrainian',
    value: 'ukr',
  },
  {
    label: 'Vietnamese',
    value: 'vnm',
  },
]

export const TRANSLATION_LANGUAGES = [
  {
    short: 'Eng',
    label: 'English',
    value: 'en',
    icon: 'i-circle-flags:gb',
  },
  {
    short: 'Chi',
    label: 'Chinese(Simplified)',
    value: 'zh_cn',
    icon: 'i-circle-flags:cn',
  },
  {
    short: 'Cht',
    label: 'Chinese(Traditional)',
    value: 'zh_tw',
    icon: 'i-circle-flags:cn',
  },
  {
    short: 'Jpn',
    label: 'Japanese',
    value: 'jp',
    icon: 'i-circle-flags:jp',
  },
  {
    short: 'Kor',
    label: 'Korean',
    value: 'ko',
    icon: 'i-circle-flags:kr',
  },
  {
    short: 'Rus',
    label: 'Russian',
    value: 'ru',
    icon: 'i-circle-flags:ru',
  },
  {
    short: 'Esp',
    label: 'Spanish',
    value: 'es',
    icon: 'i-circle-flags:es',
  },
  {
    short: 'Fra',
    label: 'French',
    value: 'fr',
    icon: 'i-circle-flags:fr',
  },
  {
    short: 'Deu',
    label: 'German',
    value: 'de',
    icon: 'i-circle-flags:de',
  },
  {
    short: 'Por',
    label: 'Portuguese',
    value: 'pt',
    icon: 'i-circle-flags:pt',
  },
]
