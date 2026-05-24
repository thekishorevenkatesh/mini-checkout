import type { AddressParts } from "../../utils/contactFields";
import {
  getCitySuggestions,
  getCountrySuggestions,
  getStateSuggestions,
  inferLocationFromCity,
} from "../../utils/locationCatalog";

type AddressFieldKey = keyof AddressParts;

type AddressFieldsProps = {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  inputClassName: string;
  gridClassName?: string;
  labelClassName?: string;
  showSuggestionHint?: boolean;
  required?: boolean;
  pincodeLabel?: string;
  datalistIdPrefix?: string;
};

function updateAddressField(
  value: AddressParts,
  onChange: (next: AddressParts) => void,
  field: AddressFieldKey,
  nextValue: string
) {
  onChange({ ...value, [field]: nextValue });
}

function updateCityField(
  value: AddressParts,
  onChange: (next: AddressParts) => void,
  nextCity: string
) {
  const matchedLocation = inferLocationFromCity(nextCity);

  if (!matchedLocation) {
    onChange({ ...value, city: nextCity });
    return;
  }

  onChange({
    ...value,
    city: matchedLocation.city,
    state: matchedLocation.state,
    country: matchedLocation.country,
  });
}

export function AddressFields({
  value,
  onChange,
  inputClassName,
  gridClassName = "sm:col-span-2 grid gap-3 sm:grid-cols-2",
  labelClassName = "block space-y-1",
  showSuggestionHint = true,
  required = false,
  pincodeLabel = "Pincode",
  datalistIdPrefix = "",
}: AddressFieldsProps) {
  const countrySuggestions = getCountrySuggestions(value.country);
  const stateSuggestions = getStateSuggestions(value.country, value.state);
  const citySuggestions = getCitySuggestions(value.country, value.state, value.city);
  const req = (label: string) => (required ? `${label} *` : label);
  const countryListId = `${datalistIdPrefix}country-suggestions`;
  const stateListId = `${datalistIdPrefix}state-suggestions`;
  const cityListId = `${datalistIdPrefix}city-suggestions`;

  return (
    <div className={gridClassName}>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">{req("Address line 1")}</span>
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
        <span className="text-sm font-semibold text-slate-700">Landmark</span>
        <input
          className={inputClassName}
          value={value.landmark}
          onChange={(event) => updateAddressField(value, onChange, "landmark", event.target.value)}
          placeholder="Nearby place or reference point"
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">{req("City")}</span>
        <input
          list={cityListId}
          className={inputClassName}
          value={value.city}
          onChange={(event) => updateCityField(value, onChange, event.target.value)}
          placeholder={value.country ? "Start typing city" : "Select or type country first"}
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">{req("State")}</span>
        <input
          list={stateListId}
          className={inputClassName}
          value={value.state}
          onChange={(event) => updateAddressField(value, onChange, "state", event.target.value)}
          placeholder={value.country ? "Start typing state" : "Select or type country first"}
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">{req("Country")}</span>
        <input
          list={countryListId}
          className={inputClassName}
          value={value.country}
          onChange={(event) => updateAddressField(value, onChange, "country", event.target.value)}
          placeholder="Start typing country"
        />
      </label>
      <label className={labelClassName}>
        <span className="text-sm font-semibold text-slate-700">{req(pincodeLabel)}</span>
        <input
          className={inputClassName}
          value={value.pincode}
          onChange={(event) => updateAddressField(value, onChange, "pincode", event.target.value.replace(/\D/g, "").slice(0, 10))}
          inputMode="numeric"
          placeholder="Enter pincode"
        />
      </label>
      {showSuggestionHint ? (
        <p className="sm:col-span-2 text-xs text-slate-500">
          City, state, and country show suggestions. Matching a known city can auto-fill its state and country.
        </p>
      ) : null}

      <datalist id={countryListId}>
        {countrySuggestions.map((country) => (
          <option key={country} value={country} />
        ))}
      </datalist>
      <datalist id={stateListId}>
        {stateSuggestions.map((state) => (
          <option key={state} value={state} />
        ))}
      </datalist>
      <datalist id={cityListId}>
        {citySuggestions.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
    </div>
  );
}
