import type { AddressParts } from "../../utils/contactFields";
import {
  getCitySuggestions,
  getCountrySuggestions,
  getStateSuggestions,
} from "../../utils/locationCatalog";

type AddressFieldKey = keyof AddressParts;

type AddressFieldsProps = {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  inputClassName: string;
  gridClassName?: string;
  labelClassName?: string;
  showSuggestionHint?: boolean;
};

function updateAddressField(
  value: AddressParts,
  onChange: (next: AddressParts) => void,
  field: AddressFieldKey,
  nextValue: string
) {
  onChange({ ...value, [field]: nextValue });
}

export function AddressFields({
  value,
  onChange,
  inputClassName,
  gridClassName = "sm:col-span-2 grid gap-3 sm:grid-cols-2",
  labelClassName = "block space-y-1",
  showSuggestionHint = true,
}: AddressFieldsProps) {
  const countrySuggestions = getCountrySuggestions(value.country);
  const stateSuggestions = getStateSuggestions(value.country, value.state);
  const citySuggestions = getCitySuggestions(value.country, value.state, value.city);

  return (
    <div className={gridClassName}>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">Address line 1</span>
        <input
          className={inputClassName}
          value={value.line1}
          onChange={(event) => updateAddressField(value, onChange, "line1", event.target.value)}
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">Address line 2</span>
        <input
          className={inputClassName}
          value={value.line2}
          onChange={(event) => updateAddressField(value, onChange, "line2", event.target.value)}
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">Country</span>
        <input
          list="country-suggestions"
          className={inputClassName}
          value={value.country}
          onChange={(event) => updateAddressField(value, onChange, "country", event.target.value)}
          placeholder="Start typing country"
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">State</span>
        <input
          list="state-suggestions"
          className={inputClassName}
          value={value.state}
          onChange={(event) => updateAddressField(value, onChange, "state", event.target.value)}
          placeholder={value.country ? "Start typing state" : "Select or type country first"}
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">City</span>
        <input
          list="city-suggestions"
          className={inputClassName}
          value={value.city}
          onChange={(event) => updateAddressField(value, onChange, "city", event.target.value)}
          placeholder={value.state ? "Start typing city" : "Select or type state first"}
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">Pincode</span>
        <input
          className={inputClassName}
          value={value.pincode}
          onChange={(event) => updateAddressField(value, onChange, "pincode", event.target.value.replace(/\D/g, "").slice(0, 10))}
          inputMode="numeric"
          placeholder="Enter pincode"
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">Landmark</span>
        <input
          className={inputClassName}
          value={value.landmark}
          onChange={(event) => updateAddressField(value, onChange, "landmark", event.target.value)}
        />
      </label>
      {showSuggestionHint ? (
        <p className="sm:col-span-2 text-xs text-slate-500">
          Country, state, and city show dropdown suggestions. You can still type a custom value if it is not listed.
        </p>
      ) : null}

      <datalist id="country-suggestions">
        {countrySuggestions.map((country) => (
          <option key={country} value={country} />
        ))}
      </datalist>
      <datalist id="state-suggestions">
        {stateSuggestions.map((state) => (
          <option key={state} value={state} />
        ))}
      </datalist>
      <datalist id="city-suggestions">
        {citySuggestions.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
    </div>
  );
}
