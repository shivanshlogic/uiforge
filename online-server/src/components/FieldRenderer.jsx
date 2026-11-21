import { useState } from 'react'
import { resolveValidation } from '../lib/fieldBehaviors.js'
import {
  Button,
  Input,
  Textarea,
  Checkbox,
  RadioGroup,
  Switch,
  Select,
  MultiSelect,
  Badge,
  Alert,
  Avatar,
  Progress,
  Spinner,
  Divider,
  Tooltip,
} from './ui/primitives.jsx'
import { Navbar, LabeledInput, CardBlock, LinkText, Slider, PaginationField, Accordion } from './ui/catalog.jsx'
import { pickFile } from '../lib/localBackend.js'

function parseCommaOptions(raw = '', valueKey = 'value') {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ label: s, [valueKey]: s }))
}

function charWidth(text = '', minW = 8, maxW = 40) {
  const length = text.trim().length || minW
  return Math.min(maxW, Math.max(minW, length + 4))
}

/**
 * Renders ONE component from the spec straight from its data -- this is
 * the entire replacement for grid_code_generator.py's JSX-text templates.
 * No generated source code, no Babel, no eval() anywhere in this app.
 *
 * `value`/`onChange` are this field's own state (lifted up to
 * GeneratedPage so Execute can read every field at once). `onFillTarget`
 * lets a "Browse" Button write into a DIFFERENT field by id.
 *
 * Note: TABS is NOT handled here. A TABS line is page-level navigation,
 * not a grid cell -- buildSpec.js pulls it out into `spec.tabsComponent`,
 * and GeneratedPage.jsx renders the tab bar (and each tab's own group of
 * components, ALSO through this same FieldRenderer) directly. See
 * GeneratedPage.jsx's header comment for why.
 */
export default function FieldRenderer({ comp, value, onChange, allValues, onFillTarget }) {
  const { resolvedType, props, id } = comp

  switch (resolvedType) {
    case 'Label':
      return <label className="text-sm font-medium text-gray-600">{props.text || props.label || ''}</label>

    case 'Input': {
      if (!props.validation) {
        return (
          <Input
            type="text"
            size={charWidth(props.placeholder)}
            placeholder={props.placeholder || ''}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
      // Validation is opt-in: only present when the .txt used the
      // `INPUT = <type> | <placeholder>` form.
      return <ValidatedInput comp={comp} value={value ?? ''} onChange={onChange} />
    }

    case 'Textarea':
      return (
        <Textarea
          cols={charWidth(props.placeholder, 16, 48)}
          placeholder={props.placeholder || ''}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'Button':
      return <ActionButton comp={comp} allValues={allValues} onFillTarget={onFillTarget} />

    case 'Checkbox':
      return <Checkbox checked={!!value} onChange={onChange} label={props.label || props.text || ''} />

    case 'Switch':
      return <Switch checked={!!value} onChange={onChange} label={props.label || props.text || ''} />

    case 'Select':
      return (
        <Select
          options={parseCommaOptions(props.options)}
          value={value ?? ''}
          onChange={onChange}
          placeholder={props.placeholder || ''}
        />
      )

    case 'MultiSelect':
      // Same comma-list options as a plain dropdown -- the stored value
      // is always an array of selected option strings (possibly empty),
      // so Execute's payload gets a real JSON array for this field.
      return (
        <MultiSelect
          options={parseCommaOptions(props.options)}
          values={value ?? []}
          onChange={onChange}
        />
      )

    case 'RadioGroup':
      return <RadioGroup name={id} options={parseCommaOptions(props.options)} value={value ?? ''} onChange={onChange} />

    case 'Badge':
      return <Badge variant={props.variant || 'default'}>{props.label || props.text || ''}</Badge>

    case 'Alert':
      return (
        <Alert variant={props.variant || 'info'} title={props.title || ''}>
          {props.message || props.text || ''}
        </Alert>
      )

    case 'Avatar':
      return <Avatar name={props.name || ''} size={props.size || 'md'} />

    case 'Divider':
      return props.label ? <Divider label={props.label} /> : <Divider />

    case 'Progress':
      return <Progress value={Number(props.value || 50)} label={props.label || ''} />

    case 'Spinner':
      return <Spinner size={props.size || 'md'} />

    case 'Navbar':
      return <Navbar brand={props.brand || ''} links={parseCommaOptions(props.links, 'href')} />

    case 'LabeledInput':
      return (
        <LabeledInput
          type={props.input_type || 'text'}
          size={charWidth(props.placeholder || props.label)}
          label={props.label || props.text || ''}
          placeholder={props.placeholder || ''}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'CardBlock':
      return <CardBlock title={props.title || ''} text={props.text || ''} />

    case 'LinkText':
      return <LinkText text={props.text || props.label || 'Link'} href={props.href || '#'} />

    case 'Slider': {
      const initial = value ?? Number(props.value || 50)
      return (
        <Slider
          min={Number(props.min || 0)}
          max={Number(props.max || 100)}
          value={initial}
          onChange={onChange}
          label={props.label || ''}
        />
      )
    }

    case 'PaginationField':
      return <PaginationField totalPages={Number(props.pages || 5)} />

    case 'Tooltip':
      return <Tooltip text={props.text || ''}>{props.trigger || props.label || 'Hover me'}</Tooltip>

    case 'Accordion': {
      const titles = (props.items || '').split(',').map((s) => s.trim()).filter(Boolean)
      const items = titles.map((t) => ({ title: t, content: `Content for ${t}` }))
      return <Accordion items={items} />
    }

    default:
      return null
  }
}

function ValidatedInput({ comp, value, onChange }) {
  const [hasError, setHasError] = useState(false)
  const rule = resolveValidation(comp.props.validation)
  return (
    <Input
      type={rule.htmlType}
      size={charWidth(comp.props.placeholder)}
      placeholder={comp.props.placeholder || ''}
      value={value}
      hasError={hasError}
      onChange={(e) => {
        onChange(e.target.value)
        setHasError(false)
      }}
      onBlur={() => setHasError(!rule.check(value))}
    />
  )
}

function ActionButton({ comp, allValues, onFillTarget }) {
  const label = comp.props.label || comp.props.text || 'Button'
  const variant = comp.props.variant || 'default'

  if (comp.buttonAction === 'browse') {
    return (
      <Button
        variant={variant}
        onClick={async () => {
          try {
            // Opens a REAL native OS file dialog on THIS machine
            // (PowerShell/osascript/zenity -- see local-backend's
            // native_dialog.py), via the local backend. No in-page
            // modal, no directory listing here at all -- the dialog
            // itself runs server-side and hands back the chosen
            // file's real absolute path directly.
            const data = await pickFile()
            if (data.error) {
              alert(data.error)
              return
            }
            if (data.path && comp.browseTargetId) onFillTarget(comp.browseTargetId, data.path)
          } catch (err) {
            alert(err.message || String(err))
          }
        }}
      >
        {label}
      </Button>
    )
  }

  if (comp.buttonAction === 'execute') {
    return (
      <Button
        variant={variant}
        onClick={() => {
          // Deliberately does NOT call the local backend. The payload
          // stays entirely in the frontend's own `values` state (see
          // GeneratedPage.jsx) -- nothing is sent anywhere from here.
          // The ONLY way anything reaches the backend is the "Extract
          // specific fields" ids-file upload below, which sends just
          // the fields named in that file, not this full payload.
          alert('Data captured. Upload an ids file below to save specific fields to the local backend.')
        }}
      >
        {label}
      </Button>
    )
  }

  return <Button variant={variant} onClick={() => console.log(`${label} clicked`)}>{label}</Button>
}
