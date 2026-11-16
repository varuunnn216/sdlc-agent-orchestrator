import type { KeyboardEvent } from 'react';
import { useRipple } from './Ripple';
import './Stepper.css';

export interface StepperStep {
  number: number;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStep: number;
  maxReachedStep: number;
  locked?: boolean;
  onStepClick: (step: number) => void;
}

function StepperButton({
  step,
  state,
  clickable,
  onSelect,
  onKeyDown,
}: {
  step: StepperStep;
  state: 'completed' | 'active' | 'upcoming';
  clickable: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { trigger, rippleLayer } = useRipple();
  return (
    <button
      type="button"
      className={`rb-stepper-btn ${state} rb-ripple-host`.trim()}
      disabled={!clickable}
      aria-current={state === 'active' ? 'step' : undefined}
      onPointerDown={clickable ? trigger : undefined}
      onClick={clickable ? onSelect : undefined}
      onKeyDown={onKeyDown}
      data-testid={`stepper-step-${step.number}`}
    >
      <span className="rb-stepper-index" aria-hidden="true">
        {state === 'completed' ? '✓' : step.number}
      </span>
      <span className="rb-stepper-label">{step.label}</span>
      {rippleLayer}
    </button>
  );
}

export function Stepper({
  steps,
  currentStep,
  maxReachedStep,
  locked = false,
  onStepClick,
}: StepperProps) {
  const activeStepObj =
    steps.find((s) => s.number === currentStep) ?? steps[0];

  const handleKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) => {
    let targetIdx = -1;
    if (e.key === 'ArrowRight') targetIdx = idx + 1;
    else if (e.key === 'ArrowLeft') targetIdx = idx - 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const target = steps[targetIdx];
    const canClick =
      !locked && target.number <= maxReachedStep && target.number !== currentStep;
    if (canClick) {
      e.preventDefault();
      onStepClick(target.number);
    }
  };

  return (
    <nav className="rb-stepper" aria-label="Guided fix progress">
      <div className="rb-stepper-desktop">
        {steps.map((step, idx) => {
          const state =
            step.number < currentStep
              ? 'completed'
              : step.number === currentStep
                ? 'active'
                : 'upcoming';
          const clickable =
            !locked &&
            step.number <= maxReachedStep &&
            step.number !== currentStep;
          return (
            <div key={step.number} className="rb-stepper-item">
              <StepperButton
                step={step}
                state={state}
                clickable={clickable}
                onSelect={() => onStepClick(step.number)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
              />
              {idx < steps.length - 1 && (
                <span
                  className={`rb-stepper-connector ${
                    step.number < currentStep ? 'completed' : ''
                  }`.trim()}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="rb-stepper-mobile" data-testid="stepper-mobile-summary">
        <span className="rb-stepper-mobile-count">
          Step {currentStep} of {steps.length}
        </span>
        <span className="rb-stepper-mobile-name">{activeStepObj?.label}</span>
      </div>
    </nav>
  );
}
