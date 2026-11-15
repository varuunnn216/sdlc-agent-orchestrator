import './SquishSwitch.css';

interface SquishSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function SquishSwitch({ checked, onChange, label }: SquishSwitchProps) {
  return (
    <label className="rb-squish-switch">
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="rb-squish-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="rb-squish-track" aria-hidden="true">
        <span className="rb-squish-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}
