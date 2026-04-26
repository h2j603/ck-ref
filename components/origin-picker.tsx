"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { COUNTRIES, labelForCode, type CountryCode } from "@/lib/countries";

const NONE = "__none__";
const OTHER = "__other__";

export type OriginValue = {
  code: CountryCode | null;
  freeText: string;
};

// Returns the string to persist in `designers.origin`. null means clear it.
export function originToString(value: OriginValue): string | null {
  if (value.code) return labelForCode(value.code);
  const t = value.freeText.trim();
  return t || null;
}

export function OriginPicker({
  value,
  onChange,
}: {
  value: OriginValue;
  onChange: (next: OriginValue) => void;
}) {
  const selectValue = value.code ?? (value.freeText ? OTHER : NONE);

  function handleSelect(v: string) {
    if (v === NONE) onChange({ code: null, freeText: "" });
    else if (v === OTHER) onChange({ code: null, freeText: value.freeText });
    else onChange({ code: v as CountryCode, freeText: "" });
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={selectValue} onValueChange={handleSelect}>
        <SelectTrigger>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.label}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>기타 (직접 입력)</SelectItem>
        </SelectContent>
      </Select>
      {selectValue === OTHER ? (
        <Input
          value={value.freeText}
          onChange={(e) => onChange({ code: null, freeText: e.target.value })}
          placeholder="예: Berlin, DE"
          autoFocus
        />
      ) : null}
    </div>
  );
}
