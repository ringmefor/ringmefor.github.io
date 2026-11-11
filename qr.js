// A QR code for a link, drawn as SVG: the Rulebook's "scan this with your iPhone" on wide screens.
// Byte mode, error correction level M, the smallest version that fits, following the QR Code
// standard (ISO/IEC 18004) as Project Nayuki's QR Code generator lays it out.
// tools/check_qr.py renders codes from this file and reads them back with OpenCV.
(function (root) {
  "use strict";

  // Error correction level M, by version (index 0 unused).
  var ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  var BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21,
    23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  var LEVEL_M = 0; // M's two format bits

  function rawDataModules(version) {
    var result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      var alignments = Math.floor(version / 7) + 2;
      result -= (25 * alignments - 10) * alignments - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(version) {
    return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];
  }

  // Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1.
  function multiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function divisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var r = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = multiply(result[j], r);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      r = multiply(r, 0x02);
    }
    return result;
  }

  function remainder(data, div) {
    var result = div.map(function () { return 0; });
    data.forEach(function (value) {
      var factor = value ^ result.shift();
      result.push(0);
      div.forEach(function (coefficient, i) { result[i] ^= multiply(coefficient, factor); });
    });
    return result;
  }

  function alignmentPositions(version, size) {
    if (version === 1) return [];
    var count = Math.floor(version / 7) + 2;
    var step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    var result = [6];
    for (var position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
    return result;
  }

  // The QR code's modules for `text`: rows of booleans, true for dark. Null if it doesn't fit.
  function modulesFor(text) {
    var bytes = Array.from(new TextEncoder().encode(text));
    var version = 1;
    for (; version <= 40; version++) {
      if (4 + (version <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(version) * 8) break;
    }
    if (version > 40) return null;

    // The data: byte mode, the length, the bytes, a terminator and padding.
    var bits = [];
    var append = function (value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    append(4, 4);
    append(bytes.length, version <= 9 ? 8 : 16);
    bytes.forEach(function (b) { append(b, 8); });
    var capacity = dataCodewords(version) * 8;
    append(0, Math.min(4, capacity - bits.length));
    append(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) append(pad, 8);
    var data = [];
    for (var b = 0; b < bits.length; b += 8) {
      var value = 0;
      for (var j = 0; j < 8; j++) value = (value << 1) | bits[b + j];
      data.push(value);
    }

    // Error correction per block, then the blocks interleaved.
    var blockCount = BLOCKS[version];
    var eccLength = ECC_PER_BLOCK[version];
    var rawCodewords = Math.floor(rawDataModules(version) / 8);
    var shortBlocks = blockCount - rawCodewords % blockCount;
    var shortLength = Math.floor(rawCodewords / blockCount);
    var generator = divisor(eccLength);
    var blocks = [];
    for (var n = 0, k = 0; n < blockCount; n++) {
      var part = data.slice(k, k + shortLength - eccLength + (n < shortBlocks ? 0 : 1));
      k += part.length;
      var ecc = remainder(part, generator);
      if (n < shortBlocks) part.push(0);
      blocks.push(part.concat(ecc));
    }
    var codewords = [];
    for (var i = 0; i < blocks[0].length; i++) {
      blocks.forEach(function (block, index) {
        if (i !== shortLength - eccLength || index >= shortBlocks) codewords.push(block[i]);
      });
    }

    // The function patterns.
    var size = version * 4 + 17;
    var modules = [];
    var isFunction = [];
    for (var y = 0; y < size; y++) {
      modules.push(new Array(size).fill(false));
      isFunction.push(new Array(size).fill(false));
    }
    var set = function (x, y, dark) {
      modules[y][x] = dark;
      isFunction[y][x] = true;
    };
    for (var t = 0; t < size; t++) {
      set(6, t, t % 2 === 0);
      set(t, 6, t % 2 === 0);
    }
    var finder = function (cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var distance = Math.max(Math.abs(dx), Math.abs(dy));
          var x = cx + dx, y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, distance !== 2 && distance !== 4);
        }
      }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    var positions = alignmentPositions(version, size);
    var count = positions.length;
    for (var a = 0; a < count; a++) {
      for (var c = 0; c < count; c++) {
        if ((a === 0 && c === 0) || (a === 0 && c === count - 1) || (a === count - 1 && c === 0)) continue;
        for (var ay = -2; ay <= 2; ay++) {
          for (var ax = -2; ax <= 2; ax++) {
            set(positions[a] + ax, positions[c] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
          }
        }
      }
    }
    var drawFormat = function (mask) {
      var info = LEVEL_M << 3 | mask;
      var rem = info;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var formatBits = (info << 10 | rem) ^ 0x5412;
      var bit = function (i) { return ((formatBits >>> i) & 1) !== 0; };
      for (var f = 0; f <= 5; f++) set(8, f, bit(f));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (var g = 9; g < 15; g++) set(14 - g, 8, bit(g));
      for (var h = 0; h < 8; h++) set(size - 1 - h, 8, bit(h));
      for (var m = 8; m < 15; m++) set(8, size - 15 + m, bit(m));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (version >= 7) {
      var rem = version;
      for (var v = 0; v < 12; v++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var versionBits = version << 12 | rem;
      for (var s = 0; s < 18; s++) {
        var dark = ((versionBits >>> s) & 1) !== 0;
        var p = size - 11 + s % 3, q = Math.floor(s / 3);
        set(p, q, dark);
        set(q, p, dark);
      }
    }

    // The codewords, in the zigzag from the bottom right.
    var bit = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var side = 0; side < 2; side++) {
          var x = right - side;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && bit < codewords.length * 8) {
            modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0;
            bit++;
          }
        }
      }
    }

    // The mask with the lowest penalty.
    var applyMask = function (mask) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var invert;
          switch (mask) {
            case 0: invert = (x + y) % 2 === 0; break;
            case 1: invert = y % 2 === 0; break;
            case 2: invert = x % 3 === 0; break;
            case 3: invert = (x + y) % 3 === 0; break;
            case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: invert = x * y % 2 + x * y % 3 === 0; break;
            case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
            default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
          }
          if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];
        }
      }
    };
    var addHistory = function (run, history) {
      if (history[0] === 0) run += size;
      history.pop();
      history.unshift(run);
    };
    var countFinderLike = function (h) {
      var n = h[1];
      var core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    };
    var lineScore = function (get) {
      var score = 0;
      for (var a = 0; a < size; a++) {
        var color = false, run = 0, history = [0, 0, 0, 0, 0, 0, 0];
        for (var b = 0; b < size; b++) {
          if (get(a, b) === color) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score++;
          } else {
            addHistory(run, history);
            if (!color) score += countFinderLike(history) * 40;
            color = get(a, b);
            run = 1;
          }
        }
        if (color) {
          addHistory(run, history);
          run = 0;
        }
        addHistory(run + size, history);
        score += countFinderLike(history) * 40;
      }
      return score;
    };
    var penalty = function () {
      var score = lineScore(function (a, b) { return modules[a][b]; }) +
        lineScore(function (a, b) { return modules[b][a]; });
      var darkCount = 0;
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (modules[y][x]) darkCount++;
          if (y < size - 1 && x < size - 1) {
            var c = modules[y][x];
            if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
          }
        }
      }
      var total = size * size;
      score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
      return score;
    };
    var best = 0, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      applyMask(mask);
      drawFormat(mask);
      var score = penalty();
      if (score < bestScore) {
        best = mask;
        bestScore = score;
      }
      applyMask(mask);
    }
    applyMask(best);
    drawFormat(best);
    return modules;
  }

  // The QR code as an SVG element's markup, with the four-module quiet zone around it.
  function svg(text, label) {
    var modules = modulesFor(text);
    if (!modules) return "";
    var size = modules.length;
    var path = "";
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (modules[y][x]) path += "M" + (x + 4) + " " + (y + 4) + "h1v1h-1z";
      }
    }
    var full = size + 8;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + full + " " + full +
      '" shape-rendering="crispEdges" role="img" aria-label="' + String(label || "QR code").replace(/"/g, "&quot;") +
      '"><rect width="' + full + '" height="' + full + '" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
  }

  var api = { modules: modulesFor, svg: svg };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.QR = api;
  }
})(typeof self !== "undefined" ? self : this);
