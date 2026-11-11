// How RingMeFor decides whether a notification rings: RuleEngine.match and ActiveHours.contains from
// the app (RingMeFor/RuleEngine.swift, RingMeFor/Models.swift), line for line, so a test on the
// website gives the app's answer. RingMeForTests/Logic/rule-cases.json is checked against both: by
// RuleCasesTests in the app's logic tests, and by tools/check_rule_cases.js against this file.
// Patterns (regular expressions) aren't here: JavaScript's differ from the app's, so pages leave
// the test off rules that have them.
(function (root) {
  "use strict";

  var EVERY = "Every notification";
  var DASHES = /[‐‑‒–—―−﹣－]/g;
  var LETTER = /\p{L}/u;
  var NUMBER = /\p{N}/u;
  var SPACE = /\s/u;

  // Capital letters, accents and full-width letters don't matter (String.folding with
  // caseInsensitive, diacriticInsensitive and widthInsensitive).
  function fold(string) {
    return string.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  }

  // Hyphen-like dashes as "-", so "follow‑up" (with a non-breaking hyphen) matches "follow-up".
  function normalizeDashes(string) {
    return string.replace(DASHES, "-");
  }

  // Characters that mean something in a regular expression, as the app's
  // NSRegularExpression.escapedPattern escapes them.
  function escapePattern(string) {
    return string.replace(/[\\^$.*+?()[\]{}|\/]/g, "\\$&");
  }

  // Scripts written without spaces between words: Chinese characters, Japanese kana, Thai, Lao,
  // Khmer and Burmese. Korean uses spaces.
  function writtenWithoutSpaces(term) {
    for (var character of term) {
      var value = character.codePointAt(0);
      if ((value >= 0x3400 && value <= 0x4DBF) || (value >= 0x4E00 && value <= 0x9FFF) ||
          (value >= 0xF900 && value <= 0xFAFF) || (value >= 0x20000 && value <= 0x2FA1F) ||
          (value >= 0x3040 && value <= 0x30FF) || (value >= 0x31F0 && value <= 0x31FF) ||
          (value >= 0xFF66 && value <= 0xFF9F) || (value >= 0x0E00 && value <= 0x0EFF) ||
          (value >= 0x1780 && value <= 0x17FF) || (value >= 0x1000 && value <= 0x109F)) {
        return true;
      }
    }
    return false;
  }

  // The term as a pattern where spaces and hyphens between its words, and a hyphen or space
  // between letters and digits, may be there or not, and a word ending in a letter may take a
  // plural ending.
  function flexiblePattern(needle) {
    var words = [];
    var word = "";
    for (var character of needle) {
      if (character === "-" || SPACE.test(character)) {
        if (word) { words.push(word); word = ""; }
      } else {
        word += character;
      }
    }
    if (word) words.push(word);
    if (!words.length) return escapePattern(needle);
    var parts = words.map(function (part) {
      // Runs of letters and of digits: "sev1" is "sev", "1".
      var runs = [];
      var current = "";
      var currentIsDigit = null;
      for (var character of part) {
        var isDigit = NUMBER.test(character);
        var isLetter = LETTER.test(character);
        if (currentIsDigit !== null && (isDigit || isLetter) && currentIsDigit !== isDigit && current !== "") {
          runs.push(current);
          current = "";
        }
        current += character;
        if (isDigit || isLetter) currentIsDigit = isDigit;
      }
      if (current) runs.push(current);
      return runs.map(escapePattern).join("[\\s-]?");
    });
    var pattern = parts.join("[\\s-]*");
    var characters = Array.from(needle);
    if (LETTER.test(characters[characters.length - 1])) {
      pattern += "(?:s|es|'s|’s)?";
    }
    return pattern;
  }

  // Whether `term` is in `haystack`. With wholeWord, "urgent" doesn't match "nonurgent", while
  // terms such as "@here" still match next to spaces and punctuation.
  function contains(haystack, term, wholeWord) {
    var needle = normalizeDashes(fold(term.trim()));
    if (!needle) return false;
    var text = normalizeDashes(fold(haystack));
    if (writtenWithoutSpaces(needle)) return text.indexOf(needle) >= 0;
    var body = flexiblePattern(needle);
    var pattern = wholeWord ? "(?<![\\p{L}\\p{N}_])" + body + "(?![\\p{L}\\p{N}_])" : body;
    try {
      return new RegExp(pattern, "u").test(text);
    } catch (error) {
      return text.indexOf(needle) >= 0;
    }
  }

  // Whether a line of `text` starts with `name`, after spaces and a "~" (how some chat apps show
  // people who aren't in your contacts).
  function startsLine(text, name) {
    var needle = fold(name.trim());
    if (!needle || !text) return false;
    var boundary = writtenWithoutSpaces(needle) ? "" : "(?![\\p{L}\\p{N}_])";
    try {
      return new RegExp("^[\\s~]*" + escapePattern(needle) + boundary, "mu").test(fold(text));
    } catch (error) {
      return false;
    }
  }

  // Whether a notification is from `person`: the name, as whole words, in the sender, title or
  // subtitle, or at the start of a line of the text. A name mentioned inside a message doesn't count.
  function isFrom(content, person) {
    var fields = [content.sender || "", content.title || "", content.subtitle || ""];
    for (var i = 0; i < fields.length; i++) {
      if (contains(fields[i], person, true)) return true;
    }
    return startsLine(content.text || "", person);
  }

  function searchText(content) {
    return [content.title || "", content.subtitle || "", content.text || ""]
      .filter(function (part) { return part !== ""; })
      .join("\n");
  }

  // The rule's "Never ring if it mentions" word that's in the notification, if any.
  function excludedBy(rule, content) {
    var haystack = searchText(content);
    var wholeWords = rule.wholeWords !== false;
    var found = (rule.exclusions || []).filter(function (word) { return contains(haystack, word, wholeWords); });
    return found.length ? found[0] : null;
  }

  // What made the rule match: { kind: "word" | "person" | "every", value }, or null.
  function match(rule, content) {
    if (excludedBy(rule, content) !== null) return null;
    if (rule.mode === "everything") return { kind: "every", value: EVERY };
    var haystack = searchText(content);
    var wholeWords = rule.wholeWords !== false;
    var keywords = rule.keywords || [];
    for (var i = 0; i < keywords.length; i++) {
      if (contains(haystack, keywords[i], wholeWords)) return { kind: "word", value: keywords[i] };
    }
    var people = rule.people || [];
    for (var j = 0; j < people.length; j++) {
      if (isFrom(content, people[j])) return { kind: "person", value: people[j] };
    }
    return null;
  }

  // ActiveHours.contains, for a weekday (1 is Sunday, 7 is Saturday) and a minute of the day.
  // Overnight windows: the part after midnight belongs to the day the window started.
  function hoursContain(hours, weekday, minute) {
    if (!hours || !hours.enabled) return true;
    var start = hours.startMinute === undefined ? 22 * 60 : hours.startMinute;
    var end = hours.endMinute === undefined ? 7 * 60 : hours.endMinute;
    var days = hours.weekdays && hours.weekdays.length ? hours.weekdays : [1, 2, 3, 4, 5, 6, 7];
    var on = function (day) { return days.indexOf(day) >= 0; };
    if (start === end) return on(weekday);
    if (start < end) return on(weekday) && minute >= start && minute < end;
    if (minute >= start) return on(weekday);
    if (minute < end) return on(weekday === 1 ? 7 : weekday - 1);
    return false;
  }

  function hoursContainDate(hours, date) {
    return hoursContain(hours, date.getDay() + 1, date.getHours() * 60 + date.getMinutes());
  }

  var api = {
    EVERY: EVERY,
    fold: fold,
    contains: contains,
    isFrom: isFrom,
    match: match,
    excludedBy: excludedBy,
    hoursContain: hoursContain,
    hoursContainDate: hoursContainDate,
  };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.RuleEngine = api;
  }
})(typeof self !== "undefined" ? self : this);
