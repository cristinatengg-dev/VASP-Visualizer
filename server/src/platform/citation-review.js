// Conservative provenance checking, not a scientific truth/entailment classifier.
// Only a standalone verbatim excerpt may carry a source number. Analysis cannot
// borrow a citation because its numbers or keywords overlap a record.
const citation = /[\[【](?:\*\*)?\s*(?:来源|原文|sources?)\s*[^\]】\n]*[\]】]/gi;
function reviewCitations(text, records = []) {
  let removed = 0, verifiedQuotes = 0;
  const clean = String(text).split(/(\n\s*\n)/).map(paragraph => {
    const exact = paragraph.trim().match(/^([\s\S]+?)\s*[\[【](?:来源|原文|source)\s*(\d+)[\]】]$/i);
    if (exact) {
      // Providers sometimes render the excerpt label literally or use Markdown
      // blockquotes. Remove only this presentation, then compare the entire body.
      const excerpt = exact[1].trim().replace(/^「原文片段」\s*/, "").replace(/^>\s?/gm, "").replace(/^「([^「」]+)」$/, "$1");
      const record = records.find(r => r.source === Number(exact[2]));
      if (excerpt.length >= 8 && excerpt.length <= 1200 && record?.content.includes(excerpt)) {
        verifiedQuotes++;
        return `「${excerpt}」[原文${exact[2]}]`;
      }
    }
    return paragraph.replace(citation, () => { removed++; return ""; });
  }).join("");
  return { text: clean.trim(), citationReview: {version: 1, verifiedQuotes, removed} };
}

// Withhold source badges during streaming; the final reply exposes only checked
// source numbers. Plain response text remains incremental.
function citationStream() {
  let pending = "";
  return (delta, final = false) => {
    pending += delta;
    let output = "";
    while (pending) {
      const start = pending.search(/[\[【]/);
      if (start < 0) { output += pending; pending = ""; break; }
      output += pending.slice(0, start); pending = pending.slice(start);
      const end = pending.search(/[\]】]/);
      if (end < 0) {
        if (final) {
          if (!/^[\[【](?:\*\*)?\s*(?:来|原|sour)/i.test(pending)) output += pending;
          pending = "";
        }
        break;
      }
      const badge = pending.slice(0, end + 1);
      if (!/^[\[【](?:\*\*)?\s*(?:来源|原文|sources?)/i.test(badge)) output += badge;
      pending = pending.slice(end + 1);
    }
    return output;
  };
}
module.exports = {reviewCitations, citationStream};
