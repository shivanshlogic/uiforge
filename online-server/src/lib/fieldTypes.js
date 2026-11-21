/**
 * TYPE values (as written in the .txt) -> resolved catalog name. Ported
 * from grid_code_generator.py's TYPE_ALIASES / DATA_FIELD_TYPES -- these
 * are the only two lookup tables from that file that still matter here.
 * Everything else in the old file was about generating JSX TEXT, which
 * this rewrite doesn't do at all -- see buildSpec.js and
 * components/FieldRenderer.jsx instead.
 */
export const TYPE_ALIASES = {
  LABEL: 'Label',
  INPUT: 'Input',
  TEXTAREA: 'Textarea',
  BUTTON: 'Button',
  CHECKBOX: 'Checkbox',
  SWITCH: 'Switch',
  DROPDOWN: 'Select',
  SELECT: 'Select',
  MULTISELECT: 'MultiSelect',
  RADIO: 'RadioGroup',
  RADIOGROUP: 'RadioGroup',
  BADGE: 'Badge',
  ALERT: 'Alert',
  AVATAR: 'Avatar',
  DIVIDER: 'Divider',
  PROGRESS: 'Progress',
  SPINNER: 'Spinner',
  NAVBAR: 'Navbar',
  LABELINPUT: 'LabeledInput',
  CARD: 'CardBlock',
  LINK: 'LinkText',
  SLIDER: 'Slider',
  TABS: 'Tabs',
  PAGINATION: 'PaginationField',
  TOOLTIP: 'Tooltip',
  ACCORDION: 'Accordion',
}

export const GRID_SUPPORTED_TYPES = Object.keys(TYPE_ALIASES).sort()

/** Resolved catalog types that represent a real user-entered value (as
 * opposed to decorative components like Label/Card/Badge/Divider). Used
 * by Execute to decide what counts as "page data" to send. */
export const DATA_FIELD_TYPES = new Set([
  'Input',
  'Textarea',
  'Checkbox',
  'Switch',
  'Select',
  'MultiSelect',
  'RadioGroup',
  'Slider',
  'LabeledInput',
])
