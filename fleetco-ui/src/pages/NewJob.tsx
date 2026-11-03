import { useState } from "react";
import { customers, STAGES } from "@/data/sample";
import { Overlay } from "@/components/ui/overlay";
import { Btn } from "@/shell/ListDetailLayout";
import {
  DateInput,
  Field,
  FieldRow,
  FormBody,
  MoneyInput,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui/field";

/**
 * A form lives in a PANEL or a PAGE, never a dialog — dialogs are for a decision and at
 * most two or three fields. This one is in a panel so the job list stays behind it.
 */
export function NewJobPanel({
  open,
  onOpenChange,
  showErrors = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The lab forces the invalid state; a real form would set this on submit. */
  showErrors?: boolean;
}) {
  const [deposit, setDeposit] = useState<number | null>(100950);

  return (
    <Overlay
      kind="panel"
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Graphics"
      title="New job"
      footer={
        <>
          <Btn>Cancel</Btn>
          <Btn primary>Create job</Btn>
        </>
      }
    >
      <FormBody>
        <Field
          label="Customer"
          error={showErrors ? "Pick a customer, or add a new one." : undefined}
        >
          {({ id, invalid }) => (
            <Select id={id} invalid={invalid} defaultValue="">
              <option value="" disabled>
                Choose a customer
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <FieldRow>
          <Field label="Asset" hint="Vehicle, trailer, sign or wall.">
            {({ id, invalid }) => (
              <TextInput id={id} invalid={invalid} placeholder="Unit 14" />
            )}
          </Field>
          <Field label="Billing type">
            {({ id, invalid }) => (
              <Select id={id} invalid={invalid} defaultValue="billable">
                <option value="billable">Billable</option>
                <option value="internal">Internal</option>
                <option value="warranty">Warranty / rework</option>
              </Select>
            )}
          </Field>
        </FieldRow>

        <Field label="Scope" optional hint="What the customer is buying, in their words.">
          {({ id, invalid }) => (
            <TextArea
              id={id}
              invalid={invalid}
              placeholder="Full wrap, printed and laminated, installed on site."
            />
          )}
        </Field>

        <FieldRow>
          <Field label="Production date" hint="Shop time, America/New_York.">
            {({ id, invalid }) => <DateInput id={id} invalid={invalid} defaultValue="2026-11-01" />}
          </Field>
          <Field
            label="Installation date"
            error={showErrors ? "Installation cannot be before production." : undefined}
          >
            {({ id, invalid }) => <DateInput id={id} invalid={invalid} defaultValue="2026-10-28" />}
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Deposit" optional hint="Applied against the final invoice.">
            {({ id, invalid }) => (
              <MoneyInput
                id={id}
                invalid={invalid}
                valueCents={deposit}
                onChangeCents={setDeposit}
              />
            )}
          </Field>
          <Field label="Starting stage">
            {({ id, invalid }) => (
              <Select id={id} invalid={invalid} defaultValue={STAGES[0]}>
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
          </Field>
        </FieldRow>

        <Field label="Priority">
          {({ id, invalid }) => (
            <Select id={id} invalid={invalid} defaultValue="Normal">
              <option>Normal</option>
              <option>High</option>
              <option>Rush</option>
            </Select>
          )}
        </Field>
      </FormBody>
    </Overlay>
  );
}
