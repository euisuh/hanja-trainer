import { sentenceAttribution, wordAttribution } from "../../../shared/sentenceAttribution";
import verifiedTatoeba from "../../../data/conversation/.verified.json";

const tatoebaOwners = new Map(Object.entries(verifiedTatoeba).map(([id, entry]) => [id, entry.sourceAuthor]));

export const AUTHORED_SOURCE = "authored";
export const AUTHORED_LABEL = "authored for this app";

function talkSource(source: string, sourceAuthor?: string) {
  const match = /^Tatoeba #(\d+)(?: \[\d+\/\d+\])?$/u.exec(source);
  if (!match) return null;
  return { id: match[1], excerpt: source.includes(" ["), owner: sourceAuthor ?? tatoebaOwners.get(match[1]) };
}

export function SourceAttribution({ source, sourceAuthor, sourceUrl }: { source?: string; sourceAuthor?: string; sourceUrl?: string }) {
  if (source === AUTHORED_SOURCE) return AUTHORED_LABEL;
  const word = sourceUrl ? wordAttribution(sourceUrl) : null;
  const talk = source ? talkSource(source, sourceAuthor) : null;
  const attribution = word ?? (talk ? {
    sourceUrl: `https://tatoeba.org/sentences/show/${talk.id}`,
    license: "CC BY 2.0 FR",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
  } : source ? sentenceAttribution(source) : null);
  const label = talk ? `Tatoeba #${talk.id}` : source ?? word?.source ?? sourceUrl ?? "";
  if (!attribution) return label;
  return <>
    <a href={attribution.sourceUrl}>{label}</a>
    {talk?.owner && <>{" · "}{talk.owner}</>}
    {" · "}
    <a href={attribution.licenseUrl}>{attribution.license}</a>
    {talk?.excerpt && <> · (발췌)</>}
  </>;
}
