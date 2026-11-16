import { useRipple } from './Ripple';
import './SquishSwitch.css';

interface SquishSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function SquishSwitch({ checked, onChange, label }: SquishSwitchProps) {
  const { trigger, rippleLayer } = useRipple();
  return (
    <label
      className="rb-squish-switch rb-ripple-host"
      onPointerDown={trigger}
      style={{ borderRadius: '999px', padding: '4px 8px 4px 4px' }}
    >
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
      {rippleLayer}
    </label>
  );
}
