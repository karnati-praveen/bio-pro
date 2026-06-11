import { useId, cloneElement, isValidElement } from "react";

// Field is a layout wrapper. Pass Input/Select/Textarea as children, or use the
// convenience exports InputField / SelectField / TextareaField.
export function Field({ label, hint, error, children, className = "" }) {
  const id = useId();
  const hasError = Boolean(error);
  const cls = ["bio-field", hasError ? "has-error" : "", className].filter(Boolean).join(" ");

  const child =
    isValidElement(children) && !children.props?.id
      ? cloneElement(children, { id })
      : children;

  return (
    <div className={cls}>
      {label && (
        <label className="bio-field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {child}
      {hint && !error && <span className="bio-field-hint">{hint}</span>}
      {error && <span className="bio-field-error" role="alert">{error}</span>}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={`bio-input${className ? " " + className : ""}`} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={`bio-select${className ? " " + className : ""}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={`bio-textarea${className ? " " + className : ""}`} {...props} />;
}

export function InputField({ label, hint, error, className: fieldCls = "", inputClassName = "", ...inputProps }) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldCls}>
      <Input className={inputClassName} {...inputProps} />
    </Field>
  );
}

export function SelectField({ label, hint, error, className: fieldCls = "", selectClassName = "", children, ...selectProps }) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldCls}>
      <Select className={selectClassName} {...selectProps}>{children}</Select>
    </Field>
  );
}

export function TextareaField({ label, hint, error, className: fieldCls = "", textareaClassName = "", ...textareaProps }) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldCls}>
      <Textarea className={textareaClassName} {...textareaProps} />
    </Field>
  );
}
