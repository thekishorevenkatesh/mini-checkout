import { AddressFields } from "./AddressFields";
import {
  DEFAULT_COUNTRY_CODE,
  EMPTY_ADDRESS,
  type AddressParts,
  type PhoneParts,
} from "../../utils/contactFields";

export type CheckoutContactAddress = {
  fullName: string;
  email?: string;
  phone: PhoneParts;
  address: AddressParts;
};

export const EMPTY_CHECKOUT_CONTACT: CheckoutContactAddress = {
  fullName: "",
  email: "",
  phone: { countryCode: DEFAULT_COUNTRY_CODE, number: "" },
  address: { ...EMPTY_ADDRESS },
};

type CheckoutAddressSectionProps = {
  title: string;
  value: CheckoutContactAddress;
  onChange: (next: CheckoutContactAddress) => void;
  inputClassName: string;
  datalistIdPrefix: string;
  required?: boolean;
  showEmail?: boolean;
  emailRequired?: boolean;
};

export function CheckoutAddressSection({
  title,
  value,
  onChange,
  inputClassName,
  datalistIdPrefix,
  required = false,
  showEmail = false,
  emailRequired = false,
}: CheckoutAddressSectionProps) {
  const updateContact = (patch: Partial<CheckoutContactAddress>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <legend className="px-1 text-sm font-bold text-slate-800 dark:text-slate-200">{title}</legend>
      <label className="block space-y-1">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Full Name{required ? " *" : ""}
        </span>
        <input
          className={inputClassName}
          value={value.fullName}
          onChange={(event) => updateContact({ fullName: event.target.value })}
          required={required}
        />
      </label>
      {showEmail && (
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Email Address{emailRequired ? " *" : ""}
          </span>
          <input
            type="email"
            className={inputClassName}
            value={value.email || ""}
            onChange={(event) => updateContact({ email: event.target.value })}
            required={emailRequired}
            placeholder="you@example.com"
          />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Phone Number{required ? " *" : ""}
        </span>
        <div className="flex gap-2">
          <input
            className="w-24 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
            value={value.phone.countryCode}
            readOnly
            disabled
            placeholder="+91"
          />
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10,15}"
            maxLength={15}
            className={`flex-1 ${inputClassName}`}
            value={value.phone.number}
            onChange={(event) =>
              updateContact({
                phone: { ...value.phone, number: event.target.value.replace(/\D/g, "") },
              })
            }
            required={required}
          />
        </div>
      </label>
      <AddressFields
        value={value.address}
        onChange={(next) => updateContact({ address: next })}
        inputClassName={inputClassName}
        gridClassName="grid gap-3 sm:grid-cols-2"
        required={required}
        pincodeLabel="Postal Code"
        datalistIdPrefix={datalistIdPrefix}
        showSuggestionHint={false}
      />
    </fieldset>
  );
}
