import { sentenceAttribution } from "../../shared/sentenceAttribution";

export function SourceAttribution({ source }: { source: string }) {
  const attribution = sentenceAttribution(source);
  if (!attribution) return source;
  return <>
    <a href={attribution.sourceUrl}>{source}</a>
    {" · "}
    <a href={attribution.licenseUrl}>{attribution.license}</a>
  </>;
}
