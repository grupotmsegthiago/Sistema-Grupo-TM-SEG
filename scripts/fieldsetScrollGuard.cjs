/** Abertura de <fieldset> que carrega classe de rolagem. O navegador não desce esse elemento. */
function aberturaFieldsetComRolagem(source) {
  const tags = String(source || '').match(/<fieldset\b[^>]*>/gi) || [];
  return tags.filter((tag) => /overflow-(?:y-auto|y-scroll|auto|scroll)\b/.test(tag));
}

module.exports = { aberturaFieldsetComRolagem };
