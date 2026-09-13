export type Attribution = {
  sourceUrl: string;
  license: string;
  licenseUrl: string;
};

export type WordAttribution = Attribution & { source: string };

export function wordAttribution(sourceUrl: string): WordAttribution | null {
  let host: string;
  try {
    host = new URL(sourceUrl).hostname;
  } catch {
    return null;
  }
  const source = {
    "ko.wiktionary.org": "한국어 위키낱말사전",
    "ja.wiktionary.org": "日本語ウィクショナリー",
    "zh.wiktionary.org": "中文维基词典",
  }[host];
  return source ? {
    source,
    sourceUrl,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  } : null;
}

export function sentenceAttribution(source: string): Attribution | null {
  const id = source.match(/#(\d+)$/u)?.[1];
  if (!id) return null;
  if (source.startsWith("Tatoeba #")) {
    return {
      sourceUrl: `https://tatoeba.org/sentences/show/${id}`,
      license: "CC BY 2.0 FR",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
    };
  }
  if (!/^(?:개역간이국한문한글판|대한민국헌법|노동야학독본|국민 소학 독본|산중신곡|3·1독립선언서|군정법령 제\d+호) #/u.test(source)) return null;
  return {
    sourceUrl: `https://ko.wikisource.org/w/index.php?oldid=${id}`,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  };
}
