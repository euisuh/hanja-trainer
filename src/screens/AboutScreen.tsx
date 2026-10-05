import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../features/settings/about.css";

type ConversationSourceDocument = { chunks: Array<{ sourceRef?: string }> };

const sources = [
  { name: "한국어문회 급수배정", license: "라이선스 명시 없음 · 사실 정보(급수·한자 목록)만 사용", href: "https://www.hanja.re.kr/kccpt/exam/levelConfirm.do" },
  { name: "HanjaDict (훈음)", license: "MIT License", href: "https://github.com/seyoungsong/hanjadict" },
  { name: "Unicode Unihan 17.0.0 (뜻풀이·총획수)", license: "Unicode 데이터 라이선스", href: "https://www.unicode.org/license.txt" },
  { name: "davidluzgouveia/kanji-data (JLPT 커리큘럼·훈독·음독)", license: "MIT License", href: "https://github.com/davidluzgouveia/kanji-data" },
  { name: "日本漢字能力検定協会 級別漢字表 (漢検 메타데이터)", license: "라이선스 명시 없음 · 사실 정보만 사용", href: "https://www.kanken.or.jp/kanken/outline/data/outline_degree_national_list20200217.pdf" },
  { name: "dahlia/shinjitai-table (신자체·구자체)", license: "라이선스 명시 없음 · 사실 정보만 사용", href: "https://github.com/dahlia/shinjitai-table" },
  { name: "profesorm/hsk30 (HSK 3.0 공식 교육요강 추출)", license: "CC BY 4.0", href: "https://github.com/profesorm/hsk30" },
  { name: "한국어·일본어·중국어 위키낱말사전 (단어 조합)", license: "CC BY-SA 4.0", href: "https://ko.wiktionary.org/" },
  { name: "Tatoeba (예문 말뭉치)", license: "CC BY 2.0 FR (일부 CC0)", href: "https://tatoeba.org/" },
] as const;

const learningSources = [
  { name: "Cepeda et al. (2006) · 분산 학습 메타분석", href: "https://doi.org/10.1037/0033-2909.132.3.354" },
  { name: "Karpicke & Roediger (2008) · 외국어 어휘 회상", href: "https://doi.org/10.1126/science.1152408" },
  { name: "Rawson & Dunlosky (2011) · 간격을 둔 재학습", href: "https://doi.org/10.1037/a0023956" },
  { name: "Butler & Roediger (2008) · 선택형 검사와 피드백", href: "https://doi.org/10.3758/MC.36.3.604" },
] as const;

const talkSourceDetails = [
  { name: "Tatoeba", license: "CC BY 2.0 FR · 문장별 출처 링크 표시", href: "https://tatoeba.org/" },
  { name: "Tanaka Corpus", license: "public domain", href: "https://www.edrdg.org/wiki/index.php/Tanaka_Corpus" },
  { name: "JMdict", license: "CC BY-SA 4.0", href: "https://www.edrdg.org/jmdict/j_jmdict.html" },
  { name: "Common Voice ja", license: "CC0", href: "https://commonvoice.mozilla.org/datasets" },
  { name: "JVS", license: "CC BY-SA 4.0", href: "https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus" },
] as const;

export const talkSources = talkSourceDetails.filter((source) => Object.values(import.meta.glob<ConversationSourceDocument>("../../data/conversation/*.json", { eager: true, import: "default" })).some((document) => document.chunks.some((chunk) => chunk.sourceRef?.startsWith(`${source.name} #`))));

export function AboutScreen() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const learningMethod = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash !== "#learning-method") return;
    learningMethod.current?.focus({ preventScroll: true });
    learningMethod.current?.scrollIntoView();
  }, [hash]);
  return (
    <section className="about-screen">
      <h1>이 앱에 대해</h1>

      <section className="about-section">
        <h2>이 앱이 하는 일</h2>
        <p>
          같은 한자(漢字/汉字/한자)를 세 트랙에서 동시에 가르칩니다: 한국
          한자능력검정, 일본 JLPT/漢検, 중국 HSK. 하나의 뜻, 세 개의 발음을
          한 화면에서 반복 학습합니다. 학습은 키보드로 완결됩니다 — 숫자키
          1–4로 보기를 고르고, Enter로 다음 카드로 넘어갑니다.
        </p>
      </section>

      <section className="about-section">
        <h2>시험 척도 안내</h2>
        <p>커리큘럼은 실제 시험 척도를 그대로 씁니다. 만든 등급이 아닙니다.</p>
        <div className="about-table-wrap">
          <table className="about-table">
            <thead>
              <tr>
                <th scope="col">트랙</th>
                <th scope="col">전체 척도</th>
                <th scope="col">현재 수록 범위</th>
                <th scope="col">수록 글자 수</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>한국 · 한자능력검정</td>
                <td>8급 → 특급</td>
                <td>8급 → 4급</td>
                <td>1,000자</td>
              </tr>
              <tr>
                <td>일본 · JLPT / 漢検</td>
                <td>N5 → N1</td>
                <td>N5 → N1 전체</td>
                <td>2,211자</td>
              </tr>
              <tr>
                <td>중국 · HSK / 通用规范汉字表</td>
                <td>HSK1 → HSK7-9</td>
                <td>HSK1 → HSK3</td>
                <td>655자</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          한국 3급II 이상과 중국 HSK4 이상은 최소 500자를 더 조사·검증해야
          하는 별도 작업이라 아직 수록되지 않았습니다. 일본은 漢検 2차
          출처가 상위 급수를 특정하지 못하는 글자에 <strong>미지정</strong>
          {" "}배지를 붙입니다 — 오류가 아니라 원본 자료의 한계입니다.
        </p>
      </section>

      <section className="about-section">
        <h2>복습이 잡히는 방식 (FSRS)</h2>
        <p>
          복습 간격은 FSRS(Free Spaced Repetition Scheduler) 알고리즘이
          정합니다. 글자별 이전 응답과 경과 시간을 바탕으로 다음 시점을
          추정하며, 기억하지 못한 글자는 곧 다시 나올 수 있습니다. 한 번의
          성공이나 표시된 간격은 숙달 또는 실제 기억 지속 시간을 보장하지
          않습니다. 글자별 정답 이력과 간격 변화는{" "}
          <button onClick={() => navigate("/stats")} type="button">통계</button>
          {" "}화면과 각 글자의 상세 페이지에서 그래프로 볼 수 있습니다.
        </p>
      </section>

      <section className="about-section" id="learning-method" ref={learningMethod} tabIndex={-1}>
        <h2>효과적으로 연습하는 법</h2>
        <ol>
          <li>만기 복습을 먼저 하고, 답을 보기 전에 소리 내거나 종이에 회상합니다.</li>
          <li>정답을 확인해 비교한 뒤 <strong>기억하지 못함</strong> 또는 <strong>정확히 기억함</strong>으로 솔직히 표시합니다. 선택지는 정답 공개 전에 사용할 수 있습니다.</li>
          <li>한 번 맞힌 것으로 숙달을 판단하지 않고, 이후 날짜에 다시 회상합니다.</li>
          <li>예문과 한자어·熟語·词语를 읽고, 일본어·중국어는 선택적으로 말하기 연습을 해 실제 맥락에 적용합니다.</li>
        </ol>
        <p>회상 여부는 본인이 표시하는 값이며 발음이나 필기를 검증한 결과가 아닙니다. 개선 여부는 XP·연속 학습·속도보다 며칠 뒤 첫 시도에서 답을 떠올렸는지로 살펴보세요.</p>
        <ul className="about-sources">
          {learningSources.map((source) => <li key={source.name}><a href={source.href} rel="noopener noreferrer" target="_blank">{source.name}</a></li>)}
        </ul>
        <p>연구는 주로 대학생의 단어쌍·외국어 어휘·산문 학습을 다뤘으며 이 앱이나 한자 학습법을 직접 시험한 결과가 아닙니다. 따라서 하루 분량, FSRS 매개변수, 세 문항 뒤 재시도는 제품상 휴리스틱이며 최적 간격이나 시험·말하기 성과를 보장하지 않습니다.</p>
      </section>

      <section className="about-section">
        <h2>비교 카드와 말하기 연습</h2>
        <p>
          한 트랙에서 이미 아는 글자는 이따금 <strong>비교 카드</strong>로
          다시 나타나 세 트랙의 발음을 나란히 보여줍니다 — 하나의 뜻, 세
          발음이라는 걸 각인시키기 위해서입니다.
        </p>
        <p>
          <strong>말하기 연습</strong>은 일본어·중국어 트랙에만 있습니다.
          한국어는 이미 유창하게 구사하는 트랙이라 시험 대비용 한자 트랙 하나로
          충분하다고 판단했습니다. 말하기 연습에서는 예문 음성을 듣고 따라
          말하며 3번 반복합니다. 녹음은{" "}
          <strong>이 화면의 메모리에만 머물며 서버로 전송되거나 채점되지
          않습니다</strong> — 다른 화면으로 이동하거나 브라우저를 닫으면
          사라집니다.
        </p>
      </section>

      <section className="about-section">
        <h2>데이터 출처와 라이선스</h2>
        <p>
          모든 한자 정보와 예문은 실제 사전·시험 공식 자료·말뭉치에서
          가져옵니다. AI가 생성하거나 번역·의역한 문장은 하나도 없습니다.
        </p>
        <ul className="about-sources">
          {sources.map((source) => (
            <li key={source.name}>
              <a href={source.href} rel="noopener noreferrer" target="_blank">{source.name}</a>
              <span>{source.license}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="about-section">
        <h2>Talk 출처와 라이선스</h2>
        <p>Talk 일본어 문장은 원문별 출처를 카드 공개 뒤에 표시합니다.</p>
        <ul className="about-sources">
          {talkSources.map((source) => (
            <li key={source.name}>
              <a href={source.href} rel="noopener noreferrer" target="_blank">{source.name}</a>
              <span>{source.license}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="about-section">
        <h2>개인정보</h2>
        <p>
          저장하는 정보와 삭제 방법은{" "}
          <a href="https://hanja.uiseoya.com/privacy" rel="noopener noreferrer" target="_blank">개인정보 처리방침</a>에서 볼 수 있습니다.
        </p>
      </section>

      <button className="about-back" onClick={() => navigate("/settings")} type="button">← 설정으로</button>
    </section>
  );
}
