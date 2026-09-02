import { sentenceAttribution, wordAttribution } from "../../shared/sentenceAttribution";

export function SourceAttribution({ source, sourceUrl }: { source?: string; sourceUrl?: string }) {
  const word = sourceUrl ? wordAttribution(sourceUrl) : null;
  const attribution = word ?? (source ? sentenceAttribution(source) : null);
  const label = source ?? word?.source ?? sourceUrl ?? "";
  if (!attribution) return label;
  return <>
    <a href={attribution.sourceUrl}>{label}</a>
    {" · "}
    <a href={attribution.licenseUrl}>{attribution.license}</a>
  </>;
}
