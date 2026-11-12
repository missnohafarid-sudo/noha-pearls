// \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod, mod.exports), cb = null), mod.exports);
// node_modules/js-aruco2/src/cv.js
var require_cv = /* @__PURE__ */ __commonJSMin(((exports) => {
	var CV = CV || {};
	exports.CV = CV;
	CV.Image = function(width, height, data) {
		this.width = width || 0;
		this.height = height || 0;
		this.data = data || [];
	};
	CV.grayscale = function(imageSrc, imageDst) {
		var src = imageSrc.data, dst = imageDst.data, len = src.length, i = 0, j = 0;
		for (; i < len; i += 4) dst[j++] = src[i] * .299 + src[i + 1] * .587 + src[i + 2] * .114 + .5 & 255;
		imageDst.width = imageSrc.width;
		imageDst.height = imageSrc.height;
		return imageDst;
	};
	CV.threshold = function(imageSrc, imageDst, threshold) {
		var src = imageSrc.data, dst = imageDst.data, len = src.length, tab = [], i = 0;
		for (; i < 256; ++i) tab[i] = i <= threshold ? 0 : 255;
		for (i = 0; i < len; ++i) dst[i] = tab[src[i]];
		imageDst.width = imageSrc.width;
		imageDst.height = imageSrc.height;
		return imageDst;
	};
	CV.adaptiveThreshold = function(imageSrc, imageDst, kernelSize, threshold) {
		var src = imageSrc.data, dst = imageDst.data, len = src.length, tab = [], i;
		CV.stackBoxBlur(imageSrc, imageDst, kernelSize);
		for (i = 0; i < 768; ++i) tab[i] = i - 255 <= -threshold ? 255 : 0;
		for (i = 0; i < len; ++i) dst[i] = tab[src[i] - dst[i] + 255];
		imageDst.width = imageSrc.width;
		imageDst.height = imageSrc.height;
		return imageDst;
	};
	CV.otsu = function(imageSrc) {
		var src = imageSrc.data, len = src.length, hist = [], threshold = 0, sum = 0, sumB = 0, wB = 0, wF = 0, max = 0, mu, between, i = 0;
		for (; i < 256; ++i) hist[i] = 0;
		for (i = 0; i < len; ++i) hist[src[i]]++;
		for (i = 0; i < 256; ++i) sum += hist[i] * i;
		for (i = 0; i < 256; ++i) {
			wB += hist[i];
			if (0 !== wB) {
				wF = len - wB;
				if (0 === wF) break;
				sumB += hist[i] * i;
				mu = sumB / wB - (sum - sumB) / wF;
				between = wB * wF * mu * mu;
				if (between > max) {
					max = between;
					threshold = i;
				}
			}
		}
		return threshold;
	};
	CV.stackBoxBlurMult = [
		1,
		171,
		205,
		293,
		57,
		373,
		79,
		137,
		241,
		27,
		391,
		357,
		41,
		19,
		283,
		265
	];
	CV.stackBoxBlurShift = [
		0,
		9,
		10,
		11,
		9,
		12,
		10,
		11,
		12,
		9,
		13,
		13,
		10,
		9,
		13,
		13
	];
	CV.BlurStack = function() {
		this.color = 0;
		this.next = null;
	};
	CV.stackBoxBlur = function(imageSrc, imageDst, kernelSize) {
		var src = imageSrc.data, dst = imageDst.data, height = imageSrc.height, width = imageSrc.width, heightMinus1 = height - 1, widthMinus1 = width - 1, size = kernelSize + kernelSize + 1, radius = kernelSize + 1, mult = CV.stackBoxBlurMult[kernelSize], shift = CV.stackBoxBlurShift[kernelSize], stack = stackStart = new CV.BlurStack(), stackStart, color, sum, pos, start, p, x, y, i = 1;
		for (; i < size; ++i) stack = stack.next = new CV.BlurStack();
		stack.next = stackStart;
		pos = 0;
		for (y = 0; y < height; ++y) {
			start = pos;
			color = src[pos];
			sum = radius * color;
			stack = stackStart;
			for (i = 0; i < radius; ++i) {
				stack.color = color;
				stack = stack.next;
			}
			for (i = 1; i < radius; ++i) {
				stack.color = src[pos + i];
				sum += stack.color;
				stack = stack.next;
			}
			stack = stackStart;
			for (x = 0; x < width; ++x) {
				dst[pos++] = sum * mult >>> shift;
				p = x + radius;
				p = start + (p < widthMinus1 ? p : widthMinus1);
				sum -= stack.color - src[p];
				stack.color = src[p];
				stack = stack.next;
			}
		}
		for (x = 0; x < width; ++x) {
			pos = x;
			start = pos + width;
			color = dst[pos];
			sum = radius * color;
			stack = stackStart;
			for (i = 0; i < radius; ++i) {
				stack.color = color;
				stack = stack.next;
			}
			for (i = 1; i < radius; ++i) {
				stack.color = dst[start];
				sum += stack.color;
				stack = stack.next;
				start += width;
			}
			stack = stackStart;
			for (y = 0; y < height; ++y) {
				dst[pos] = sum * mult >>> shift;
				p = y + radius;
				p = x + (p < heightMinus1 ? p : heightMinus1) * width;
				sum -= stack.color - dst[p];
				stack.color = dst[p];
				stack = stack.next;
				pos += width;
			}
		}
		return imageDst;
	};
	CV.gaussianBlur = function(imageSrc, imageDst, imageMean, kernelSize) {
		var kernel = CV.gaussianKernel(kernelSize);
		imageDst.width = imageSrc.width;
		imageDst.height = imageSrc.height;
		imageMean.width = imageSrc.width;
		imageMean.height = imageSrc.height;
		CV.gaussianBlurFilter(imageSrc, imageMean, kernel, true);
		CV.gaussianBlurFilter(imageMean, imageDst, kernel, false);
		return imageDst;
	};
	CV.gaussianBlurFilter = function(imageSrc, imageDst, kernel, horizontal) {
		var src = imageSrc.data, dst = imageDst.data, height = imageSrc.height, width = imageSrc.width, pos = 0, limit = kernel.length >> 1, cur, value, i = 0, j, k;
		for (; i < height; ++i) for (j = 0; j < width; ++j) {
			value = 0;
			for (k = -limit; k <= limit; ++k) {
				if (horizontal) {
					cur = pos + k;
					if (j + k < 0) cur = pos;
					else if (j + k >= width) cur = pos;
				} else {
					cur = pos + k * width;
					if (i + k < 0) cur = pos;
					else if (i + k >= height) cur = pos;
				}
				value += kernel[limit + k] * src[cur];
			}
			dst[pos++] = horizontal ? value : value + .5 & 255;
		}
		return imageDst;
	};
	CV.gaussianKernel = function(kernelSize) {
		var tab = [
			[1],
			[
				.25,
				.5,
				.25
			],
			[
				.0625,
				.25,
				.375,
				.25,
				.0625
			],
			[
				.03125,
				.109375,
				.21875,
				.28125,
				.21875,
				.109375,
				.03125
			]
		], kernel = [], center, sigma, scale2X, sum, x, i;
		if (kernelSize <= 7 && kernelSize % 2 === 1) kernel = tab[kernelSize >> 1];
		else {
			center = (kernelSize - 1) * .5;
			sigma = .8 + .3 * (center - 1);
			scale2X = -.5 / (sigma * sigma);
			sum = 0;
			for (i = 0; i < kernelSize; ++i) {
				x = i - center;
				sum += kernel[i] = Math.exp(scale2X * x * x);
			}
			sum = 1 / sum;
			for (i = 0; i < kernelSize; ++i) kernel[i] *= sum;
		}
		return kernel;
	};
	CV.findContours = function(imageSrc, binary) {
		var width = imageSrc.width, height = imageSrc.height, contours = [], src = CV.binaryBorder(imageSrc, binary), deltas = CV.neighborhoodDeltas(width + 2), pos = width + 3, pix, nbd = 1, outer, hole, i = 0, j;
		for (; i < height; ++i, pos += 2) for (j = 0; j < width; ++j, ++pos) {
			pix = src[pos];
			if (0 !== pix) {
				outer = hole = false;
				if (1 === pix && 0 === src[pos - 1]) outer = true;
				else if (pix >= 1 && 0 === src[pos + 1]) hole = true;
				if (outer || hole) {
					++nbd;
					contours.push(CV.borderFollowing(src, pos, nbd, {
						x: j,
						y: i
					}, hole, deltas));
				}
			}
		}
		return contours;
	};
	CV.borderFollowing = function(src, pos, nbd, point, hole, deltas) {
		var contour = [], pos1, pos3, pos4, s, s_end;
		contour.hole = hole;
		s = s_end = hole ? 0 : 4;
		do {
			s = s - 1 & 7;
			pos1 = pos + deltas[s];
			if (src[pos1] !== 0) break;
		} while (s !== s_end);
		if (s === s_end) {
			src[pos] = -nbd;
			contour.push({
				x: point.x,
				y: point.y
			});
		} else {
			pos3 = pos;
			s ^ 4;
			while (true) {
				s_end = s;
				do
					pos4 = pos3 + deltas[++s];
				while (src[pos4] === 0);
				s &= 7;
				if (s - 1 >>> 0 < s_end >>> 0) src[pos3] = -nbd;
				else if (src[pos3] === 1) src[pos3] = nbd;
				contour.push({
					x: point.x,
					y: point.y
				});
				point.x += CV.neighborhood[s][0];
				point.y += CV.neighborhood[s][1];
				if (pos4 === pos && pos3 === pos1) break;
				pos3 = pos4;
				s = s + 4 & 7;
			}
		}
		return contour;
	};
	CV.neighborhood = [
		[1, 0],
		[1, -1],
		[0, -1],
		[-1, -1],
		[-1, 0],
		[-1, 1],
		[0, 1],
		[1, 1]
	];
	CV.neighborhoodDeltas = function(width) {
		var deltas = [], len = CV.neighborhood.length, i = 0;
		for (; i < len; ++i) deltas[i] = CV.neighborhood[i][0] + CV.neighborhood[i][1] * width;
		return deltas.concat(deltas);
	};
	CV.approxPolyDP = function(contour, epsilon) {
		var slice = {
			start_index: 0,
			end_index: 0
		}, right_slice = {
			start_index: 0,
			end_index: 0
		}, poly = [], stack = [], len = contour.length, pt, start_pt, end_pt, dist, max_dist, le_eps, dx, dy, i, j, k;
		epsilon *= epsilon;
		k = 0;
		for (i = 0; i < 3; ++i) {
			max_dist = 0;
			k = (k + right_slice.start_index) % len;
			start_pt = contour[k];
			if (++k === len) k = 0;
			for (j = 1; j < len; ++j) {
				pt = contour[k];
				if (++k === len) k = 0;
				dx = pt.x - start_pt.x;
				dy = pt.y - start_pt.y;
				dist = dx * dx + dy * dy;
				if (dist > max_dist) {
					max_dist = dist;
					right_slice.start_index = j;
				}
			}
		}
		if (max_dist <= epsilon) poly.push({
			x: start_pt.x,
			y: start_pt.y
		});
		else {
			slice.start_index = k;
			slice.end_index = right_slice.start_index += slice.start_index;
			right_slice.start_index -= right_slice.start_index >= len ? len : 0;
			right_slice.end_index = slice.start_index;
			if (right_slice.end_index < right_slice.start_index) right_slice.end_index += len;
			stack.push({
				start_index: right_slice.start_index,
				end_index: right_slice.end_index
			});
			stack.push({
				start_index: slice.start_index,
				end_index: slice.end_index
			});
		}
		while (stack.length !== 0) {
			slice = stack.pop();
			end_pt = contour[slice.end_index % len];
			start_pt = contour[k = slice.start_index % len];
			if (++k === len) k = 0;
			if (slice.end_index <= slice.start_index + 1) le_eps = true;
			else {
				max_dist = 0;
				dx = end_pt.x - start_pt.x;
				dy = end_pt.y - start_pt.y;
				for (i = slice.start_index + 1; i < slice.end_index; ++i) {
					pt = contour[k];
					if (++k === len) k = 0;
					dist = Math.abs((pt.y - start_pt.y) * dx - (pt.x - start_pt.x) * dy);
					if (dist > max_dist) {
						max_dist = dist;
						right_slice.start_index = i;
					}
				}
				le_eps = max_dist * max_dist <= epsilon * (dx * dx + dy * dy);
			}
			if (le_eps) poly.push({
				x: start_pt.x,
				y: start_pt.y
			});
			else {
				right_slice.end_index = slice.end_index;
				slice.end_index = right_slice.start_index;
				stack.push({
					start_index: right_slice.start_index,
					end_index: right_slice.end_index
				});
				stack.push({
					start_index: slice.start_index,
					end_index: slice.end_index
				});
			}
		}
		return poly;
	};
	CV.warp = function(imageSrc, imageDst, contour, warpSize) {
		var src = imageSrc.data, dst = imageDst.data, width = imageSrc.width, height = imageSrc.height, pos = 0, sx1, sx2, dx1, dx2, sy1, sy2, dy1, dy2, p1, p2, p3, p4, m = CV.getPerspectiveTransform(contour, warpSize - 1), r = m[8], s = m[2], t = m[5], u, v, w, x, y, i = 0, j;
		for (; i < warpSize; ++i) {
			r += m[7];
			s += m[1];
			t += m[4];
			u = r;
			v = s;
			w = t;
			for (j = 0; j < warpSize; ++j) {
				u += m[6];
				v += m[0];
				w += m[3];
				x = v / u;
				y = w / u;
				sx1 = x >>> 0;
				sx2 = sx1 === width - 1 ? sx1 : sx1 + 1;
				dx1 = x - sx1;
				dx2 = 1 - dx1;
				sy1 = y >>> 0;
				sy2 = sy1 === height - 1 ? sy1 : sy1 + 1;
				dy1 = y - sy1;
				dy2 = 1 - dy1;
				p1 = p2 = sy1 * width;
				p3 = p4 = sy2 * width;
				dst[pos++] = dy2 * (dx2 * src[p1 + sx1] + dx1 * src[p2 + sx2]) + dy1 * (dx2 * src[p3 + sx1] + dx1 * src[p4 + sx2]) & 255;
			}
		}
		imageDst.width = warpSize;
		imageDst.height = warpSize;
		return imageDst;
	};
	CV.getPerspectiveTransform = function(src, size) {
		var rq = CV.square2quad(src);
		rq[0] /= size;
		rq[1] /= size;
		rq[3] /= size;
		rq[4] /= size;
		rq[6] /= size;
		rq[7] /= size;
		return rq;
	};
	CV.square2quad = function(src) {
		var sq = [], px = src[0].x - src[1].x + src[2].x - src[3].x, py = src[0].y - src[1].y + src[2].y - src[3].y, dx1, dx2, dy1, dy2, den;
		if (0 === px && 0 === py) {
			sq[0] = src[1].x - src[0].x;
			sq[1] = src[2].x - src[1].x;
			sq[2] = src[0].x;
			sq[3] = src[1].y - src[0].y;
			sq[4] = src[2].y - src[1].y;
			sq[5] = src[0].y;
			sq[6] = 0;
			sq[7] = 0;
			sq[8] = 1;
		} else {
			dx1 = src[1].x - src[2].x;
			dx2 = src[3].x - src[2].x;
			dy1 = src[1].y - src[2].y;
			dy2 = src[3].y - src[2].y;
			den = dx1 * dy2 - dx2 * dy1;
			sq[6] = (px * dy2 - dx2 * py) / den;
			sq[7] = (dx1 * py - px * dy1) / den;
			sq[8] = 1;
			sq[0] = src[1].x - src[0].x + sq[6] * src[1].x;
			sq[1] = src[3].x - src[0].x + sq[7] * src[3].x;
			sq[2] = src[0].x;
			sq[3] = src[1].y - src[0].y + sq[6] * src[1].y;
			sq[4] = src[3].y - src[0].y + sq[7] * src[3].y;
			sq[5] = src[0].y;
		}
		return sq;
	};
	CV.isContourConvex = function(contour) {
		var orientation = 0, convex = true, len = contour.length, i = 0, j = 0, cur_pt, prev_pt = contour[len - 1], dxdy0, dydx0, dx0, dy0, dx, dy;
		cur_pt = contour[0];
		dx0 = cur_pt.x - prev_pt.x;
		dy0 = cur_pt.y - prev_pt.y;
		for (; i < len; ++i) {
			if (++j === len) j = 0;
			prev_pt = cur_pt;
			cur_pt = contour[j];
			dx = cur_pt.x - prev_pt.x;
			dy = cur_pt.y - prev_pt.y;
			dxdy0 = dx * dy0;
			dydx0 = dy * dx0;
			orientation |= dydx0 > dxdy0 ? 1 : dydx0 < dxdy0 ? 2 : 3;
			if (3 === orientation) {
				convex = false;
				break;
			}
			dx0 = dx;
			dy0 = dy;
		}
		return convex;
	};
	CV.perimeter = function(poly) {
		var len = poly.length, i = 0, j = len - 1, p = 0, dx, dy;
		for (; i < len; j = i++) {
			dx = poly[i].x - poly[j].x;
			dy = poly[i].y - poly[j].y;
			p += Math.sqrt(dx * dx + dy * dy);
		}
		return p;
	};
	CV.minEdgeLength = function(poly) {
		var len = poly.length, i = 0, j = len - 1, min = Infinity, d, dx, dy;
		for (; i < len; j = i++) {
			dx = poly[i].x - poly[j].x;
			dy = poly[i].y - poly[j].y;
			d = dx * dx + dy * dy;
			if (d < min) min = d;
		}
		return Math.sqrt(min);
	};
	CV.countNonZero = function(imageSrc, square) {
		var src = imageSrc.data, height = square.height, width = square.width, pos = square.x + square.y * imageSrc.width, span = imageSrc.width - width, nz = 0, i = 0, j;
		for (; i < height; ++i) {
			for (j = 0; j < width; ++j) if (0 !== src[pos++]) ++nz;
			pos += span;
		}
		return nz;
	};
	CV.binaryBorder = function(imageSrc, dst) {
		var src = imageSrc.data, height = imageSrc.height, width = imageSrc.width, posSrc = 0, posDst = 0, i, j = -2;
		for (; j < width; ++j) dst[posDst++] = 0;
		for (i = 0; i < height; ++i) {
			dst[posDst++] = 0;
			for (j = 0; j < width; ++j) dst[posDst++] = 0 === src[posSrc++] ? 0 : 1;
			dst[posDst++] = 0;
		}
		for (j = -2; j < width; ++j) dst[posDst++] = 0;
		return dst;
	};
}));
// node_modules/js-aruco2/src/aruco.js
var require_aruco = /* @__PURE__ */ __commonJSMin(((exports) => {
	var AR = {};
	var CV = exports.CV || require_cv().CV;
	exports.AR = AR;
	AR.DICTIONARIES = {
		ARUCO: {
			nBits: 25,
			tau: 3,
			codeList: [
				17318416,
				17318423,
				17318409,
				17318414,
				17318640,
				17318647,
				17318633,
				17318638,
				17318192,
				17318199,
				17318185,
				17318190,
				17318352,
				17318359,
				17318345,
				17318350,
				17325584,
				17325591,
				17325577,
				17325582,
				17325808,
				17325815,
				17325801,
				17325806,
				17325360,
				17325367,
				17325353,
				17325358,
				17325520,
				17325527,
				17325513,
				17325518,
				17311248,
				17311255,
				17311241,
				17311246,
				17311472,
				17311479,
				17311465,
				17311470,
				17311024,
				17311031,
				17311017,
				17311022,
				17311184,
				17311191,
				17311177,
				17311182,
				17316368,
				17316375,
				17316361,
				17316366,
				17316592,
				17316599,
				17316585,
				17316590,
				17316144,
				17316151,
				17316137,
				17316142,
				17316304,
				17316311,
				17316297,
				17316302,
				17547792,
				17547799,
				17547785,
				17547790,
				17548016,
				17548023,
				17548009,
				17548014,
				17547568,
				17547575,
				17547561,
				17547566,
				17547728,
				17547735,
				17547721,
				17547726,
				17554960,
				17554967,
				17554953,
				17554958,
				17555184,
				17555191,
				17555177,
				17555182,
				17554736,
				17554743,
				17554729,
				17554734,
				17554896,
				17554903,
				17554889,
				17554894,
				17540624,
				17540631,
				17540617,
				17540622,
				17540848,
				17540855,
				17540841,
				17540846,
				17540400,
				17540407,
				17540393,
				17540398,
				17540560,
				17540567,
				17540553,
				17540558,
				17545744,
				17545751,
				17545737,
				17545742,
				17545968,
				17545975,
				17545961,
				17545966,
				17545520,
				17545527,
				17545513,
				17545518,
				17545680,
				17545687,
				17545673,
				17545678,
				17089040,
				17089047,
				17089033,
				17089038,
				17089264,
				17089271,
				17089257,
				17089262,
				17088816,
				17088823,
				17088809,
				17088814,
				17088976,
				17088983,
				17088969,
				17088974,
				17096208,
				17096215,
				17096201,
				17096206,
				17096432,
				17096439,
				17096425,
				17096430,
				17095984,
				17095991,
				17095977,
				17095982,
				17096144,
				17096151,
				17096137,
				17096142,
				17081872,
				17081879,
				17081865,
				17081870,
				17082096,
				17082103,
				17082089,
				17082094,
				17081648,
				17081655,
				17081641,
				17081646,
				17081808,
				17081815,
				17081801,
				17081806,
				17086992,
				17086999,
				17086985,
				17086990,
				17087216,
				17087223,
				17087209,
				17087214,
				17086768,
				17086775,
				17086761,
				17086766,
				17086928,
				17086935,
				17086921,
				17086926,
				17252880,
				17252887,
				17252873,
				17252878,
				17253104,
				17253111,
				17253097,
				17253102,
				17252656,
				17252663,
				17252649,
				17252654,
				17252816,
				17252823,
				17252809,
				17252814,
				17260048,
				17260055,
				17260041,
				17260046,
				17260272,
				17260279,
				17260265,
				17260270,
				17259824,
				17259831,
				17259817,
				17259822,
				17259984,
				17259991,
				17259977,
				17259982,
				17245712,
				17245719,
				17245705,
				17245710,
				17245936,
				17245943,
				17245929,
				17245934,
				17245488,
				17245495,
				17245481,
				17245486,
				17245648,
				17245655,
				17245641,
				17245646,
				17250832,
				17250839,
				17250825,
				17250830,
				17251056,
				17251063,
				17251049,
				17251054,
				17250608,
				17250615,
				17250601,
				17250606,
				17250768,
				17250775,
				17250761,
				17250766,
				24658448,
				24658455,
				24658441,
				24658446,
				24658672,
				24658679,
				24658665,
				24658670,
				24658224,
				24658231,
				24658217,
				24658222,
				24658384,
				24658391,
				24658377,
				24658382,
				24665616,
				24665623,
				24665609,
				24665614,
				24665840,
				24665847,
				24665833,
				24665838,
				24665392,
				24665399,
				24665385,
				24665390,
				24665552,
				24665559,
				24665545,
				24665550,
				24651280,
				24651287,
				24651273,
				24651278,
				24651504,
				24651511,
				24651497,
				24651502,
				24651056,
				24651063,
				24651049,
				24651054,
				24651216,
				24651223,
				24651209,
				24651214,
				24656400,
				24656407,
				24656393,
				24656398,
				24656624,
				24656631,
				24656617,
				24656622,
				24656176,
				24656183,
				24656169,
				24656174,
				24656336,
				24656343,
				24656329,
				24656334,
				24887824,
				24887831,
				24887817,
				24887822,
				24888048,
				24888055,
				24888041,
				24888046,
				24887600,
				24887607,
				24887593,
				24887598,
				24887760,
				24887767,
				24887753,
				24887758,
				24894992,
				24894999,
				24894985,
				24894990,
				24895216,
				24895223,
				24895209,
				24895214,
				24894768,
				24894775,
				24894761,
				24894766,
				24894928,
				24894935,
				24894921,
				24894926,
				24880656,
				24880663,
				24880649,
				24880654,
				24880880,
				24880887,
				24880873,
				24880878,
				24880432,
				24880439,
				24880425,
				24880430,
				24880592,
				24880599,
				24880585,
				24880590,
				24885776,
				24885783,
				24885769,
				24885774,
				24886e3,
				24886007,
				24885993,
				24885998,
				24885552,
				24885559,
				24885545,
				24885550,
				24885712,
				24885719,
				24885705,
				24885710,
				24429072,
				24429079,
				24429065,
				24429070,
				24429296,
				24429303,
				24429289,
				24429294,
				24428848,
				24428855,
				24428841,
				24428846,
				24429008,
				24429015,
				24429001,
				24429006,
				24436240,
				24436247,
				24436233,
				24436238,
				24436464,
				24436471,
				24436457,
				24436462,
				24436016,
				24436023,
				24436009,
				24436014,
				24436176,
				24436183,
				24436169,
				24436174,
				24421904,
				24421911,
				24421897,
				24421902,
				24422128,
				24422135,
				24422121,
				24422126,
				24421680,
				24421687,
				24421673,
				24421678,
				24421840,
				24421847,
				24421833,
				24421838,
				24427024,
				24427031,
				24427017,
				24427022,
				24427248,
				24427255,
				24427241,
				24427246,
				24426800,
				24426807,
				24426793,
				24426798,
				24426960,
				24426967,
				24426953,
				24426958,
				24592912,
				24592919,
				24592905,
				24592910,
				24593136,
				24593143,
				24593129,
				24593134,
				24592688,
				24592695,
				24592681,
				24592686,
				24592848,
				24592855,
				24592841,
				24592846,
				24600080,
				24600087,
				24600073,
				24600078,
				24600304,
				24600311,
				24600297,
				24600302,
				24599856,
				24599863,
				24599849,
				24599854,
				24600016,
				24600023,
				24600009,
				24600014,
				24585744,
				24585751,
				24585737,
				24585742,
				24585968,
				24585975,
				24585961,
				24585966,
				24585520,
				24585527,
				24585513,
				24585518,
				24585680,
				24585687,
				24585673,
				24585678,
				24590864,
				24590871,
				24590857,
				24590862,
				24591088,
				24591095,
				24591081,
				24591086,
				24590640,
				24590647,
				24590633,
				24590638,
				24590800,
				24590807,
				24590793,
				24590798,
				9978384,
				9978391,
				9978377,
				9978382,
				9978608,
				9978615,
				9978601,
				9978606,
				9978160,
				9978167,
				9978153,
				9978158,
				9978320,
				9978327,
				9978313,
				9978318,
				9985552,
				9985559,
				9985545,
				9985550,
				9985776,
				9985783,
				9985769,
				9985774,
				9985328,
				9985335,
				9985321,
				9985326,
				9985488,
				9985495,
				9985481,
				9985486,
				9971216,
				9971223,
				9971209,
				9971214,
				9971440,
				9971447,
				9971433,
				9971438,
				9970992,
				9970999,
				9970985,
				9970990,
				9971152,
				9971159,
				9971145,
				9971150,
				9976336,
				9976343,
				9976329,
				9976334,
				9976560,
				9976567,
				9976553,
				9976558,
				9976112,
				9976119,
				9976105,
				9976110,
				9976272,
				9976279,
				9976265,
				9976270,
				10207760,
				10207767,
				10207753,
				10207758,
				10207984,
				10207991,
				10207977,
				10207982,
				10207536,
				10207543,
				10207529,
				10207534,
				10207696,
				10207703,
				10207689,
				10207694,
				10214928,
				10214935,
				10214921,
				10214926,
				10215152,
				10215159,
				10215145,
				10215150,
				10214704,
				10214711,
				10214697,
				10214702,
				10214864,
				10214871,
				10214857,
				10214862,
				10200592,
				10200599,
				10200585,
				10200590,
				10200816,
				10200823,
				10200809,
				10200814,
				10200368,
				10200375,
				10200361,
				10200366,
				10200528,
				10200535,
				10200521,
				10200526,
				10205712,
				10205719,
				10205705,
				10205710,
				10205936,
				10205943,
				10205929,
				10205934,
				10205488,
				10205495,
				10205481,
				10205486,
				10205648,
				10205655,
				10205641,
				10205646,
				9749008,
				9749015,
				9749001,
				9749006,
				9749232,
				9749239,
				9749225,
				9749230,
				9748784,
				9748791,
				9748777,
				9748782,
				9748944,
				9748951,
				9748937,
				9748942,
				9756176,
				9756183,
				9756169,
				9756174,
				9756400,
				9756407,
				9756393,
				9756398,
				9755952,
				9755959,
				9755945,
				9755950,
				9756112,
				9756119,
				9756105,
				9756110,
				9741840,
				9741847,
				9741833,
				9741838,
				9742064,
				9742071,
				9742057,
				9742062,
				9741616,
				9741623,
				9741609,
				9741614,
				9741776,
				9741783,
				9741769,
				9741774,
				9746960,
				9746967,
				9746953,
				9746958,
				9747184,
				9747191,
				9747177,
				9747182,
				9746736,
				9746743,
				9746729,
				9746734,
				9746896,
				9746903,
				9746889,
				9746894,
				9912848,
				9912855,
				9912841,
				9912846,
				9913072,
				9913079,
				9913065,
				9913070,
				9912624,
				9912631,
				9912617,
				9912622,
				9912784,
				9912791,
				9912777,
				9912782,
				9920016,
				9920023,
				9920009,
				9920014,
				9920240,
				9920247,
				9920233,
				9920238,
				9919792,
				9919799,
				9919785,
				9919790,
				9919952,
				9919959,
				9919945,
				9919950,
				9905680,
				9905687,
				9905673,
				9905678,
				9905904,
				9905911,
				9905897,
				9905902,
				9905456,
				9905463,
				9905449,
				9905454,
				9905616,
				9905623,
				9905609,
				9905614,
				9910800,
				9910807,
				9910793,
				9910798,
				9911024,
				9911031,
				9911017,
				9911022,
				9910576,
				9910583,
				9910569,
				9910574,
				9910736,
				9910743,
				9910729,
				9910734,
				15221264,
				15221271,
				15221257,
				15221262,
				15221488,
				15221495,
				15221481,
				15221486,
				15221040,
				15221047,
				15221033,
				15221038,
				15221200,
				15221207,
				15221193,
				15221198,
				15228432,
				15228439,
				15228425,
				15228430,
				15228656,
				15228663,
				15228649,
				15228654,
				15228208,
				15228215,
				15228201,
				15228206,
				15228368,
				15228375,
				15228361,
				15228366,
				15214096,
				15214103,
				15214089,
				15214094,
				15214320,
				15214327,
				15214313,
				15214318,
				15213872,
				15213879,
				15213865,
				15213870,
				15214032,
				15214039,
				15214025,
				15214030,
				15219216,
				15219223,
				15219209,
				15219214,
				15219440,
				15219447,
				15219433,
				15219438,
				15218992,
				15218999,
				15218985,
				15218990,
				15219152,
				15219159,
				15219145,
				15219150,
				15450640,
				15450647,
				15450633,
				15450638,
				15450864,
				15450871,
				15450857,
				15450862,
				15450416,
				15450423,
				15450409,
				15450414,
				15450576,
				15450583,
				15450569,
				15450574,
				15457808,
				15457815,
				15457801,
				15457806,
				15458032,
				15458039,
				15458025,
				15458030,
				15457584,
				15457591,
				15457577,
				15457582,
				15457744,
				15457751,
				15457737,
				15457742,
				15443472,
				15443479,
				15443465,
				15443470,
				15443696,
				15443703,
				15443689,
				15443694,
				15443248,
				15443255,
				15443241,
				15443246,
				15443408,
				15443415,
				15443401,
				15443406,
				15448592,
				15448599,
				15448585,
				15448590,
				15448816,
				15448823,
				15448809,
				15448814,
				15448368,
				15448375,
				15448361,
				15448366,
				15448528,
				15448535,
				15448521,
				15448526,
				14991888,
				14991895,
				14991881,
				14991886,
				14992112,
				14992119,
				14992105,
				14992110,
				14991664,
				14991671,
				14991657,
				14991662,
				14991824,
				14991831,
				14991817,
				14991822,
				14999056,
				14999063,
				14999049,
				14999054,
				14999280,
				14999287,
				14999273,
				14999278,
				14998832,
				14998839,
				14998825,
				14998830,
				14998992,
				14998999,
				14998985,
				14998990,
				14984720,
				14984727,
				14984713,
				14984718,
				14984944,
				14984951,
				14984937,
				14984942,
				14984496,
				14984503,
				14984489,
				14984494,
				14984656,
				14984663,
				14984649,
				14984654,
				14989840,
				14989847,
				14989833,
				14989838,
				14990064,
				14990071,
				14990057,
				14990062,
				14989616,
				14989623,
				14989609,
				14989614,
				14989776,
				14989783,
				14989769,
				14989774,
				15155728,
				15155735,
				15155721,
				15155726,
				15155952,
				15155959,
				15155945,
				15155950,
				15155504,
				15155511,
				15155497,
				15155502,
				15155664,
				15155671,
				15155657,
				15155662,
				15162896,
				15162903,
				15162889,
				15162894,
				15163120,
				15163127,
				15163113,
				15163118,
				15162672,
				15162679,
				15162665,
				15162670,
				15162832,
				15162839,
				15162825,
				15162830,
				15148560,
				15148567,
				15148553,
				15148558,
				15148784,
				15148791,
				15148777,
				15148782,
				15148336,
				15148343,
				15148329,
				15148334,
				15148496,
				15148503,
				15148489,
				15148494,
				15153680,
				15153687,
				15153673,
				15153678,
				15153904,
				15153911,
				15153897,
				15153902,
				15153456,
				15153463,
				15153449,
				15153454,
				15153616,
				15153623,
				15153609
			]
		},
		ARUCO_MIP_36h12: {
			nBits: 36,
			tau: 12,
			codeList: [
				56562524317,
				25770931429,
				4839161458,
				68596624564,
				35931143241,
				48420814492,
				29449387539,
				22088012831,
				150160643,
				38290206414,
				63018100589,
				7237360708,
				48463388455,
				12429895739,
				32398847912,
				10690557310,
				36811505649,
				20424594438,
				51348452625,
				59082132829,
				4789649285,
				6074601013,
				60833300223,
				17865158156,
				38878348407,
				9422290067,
				52530265596,
				1112263881,
				11282798128,
				31716556182,
				55939809049,
				65378188640,
				53364103696,
				16135388261,
				10585857635,
				18405277539,
				58620300626,
				16314326873,
				45976886702,
				36730781048,
				49079839777,
				48251450950,
				9367376904,
				46270871306,
				45811842918,
				20579384461,
				24858916784,
				45800689157,
				1885099856,
				46307169374,
				30966095476,
				37785816804,
				61277293828,
				48822885856,
				10217422095,
				64915480245,
				43389267094,
				6254111746,
				8290563862,
				37342276841,
				28460125290,
				3495333372,
				6758227551,
				7209929928,
				55814160128,
				56029470330,
				36738889758,
				18344320185,
				58975059075,
				44171881969,
				49170624125,
				3264591167,
				65657841412,
				41180650537,
				42494701445,
				36108643611,
				34639993860,
				28659990498,
				26930865685,
				15452591512,
				7682723690,
				52184653157,
				35325736853,
				15770954845,
				14355922747,
				3586151781,
				12705066820,
				36172812353,
				26860166751,
				55306861815,
				4458230846,
				52097670290,
				14416739556,
				18680720626,
				63503185964,
				21886004944,
				12308700311,
				12349350212,
				17960603545,
				41482020135,
				38252944768,
				36805791540,
				10164380688,
				9551813940,
				38630526064,
				39745661296,
				34997908492,
				4238126902,
				28053085457,
				30473796616,
				4054545961,
				43846990872,
				20404992582,
				8671648998,
				46543146295,
				35647704329,
				17739867588,
				36459700136,
				32297088841,
				21060713596,
				51319791578,
				58119572901,
				9474224e3,
				14900282644,
				46136470867,
				14594576121,
				19808283810,
				1010425331,
				53297363037,
				24692637543,
				26359373345,
				46113281484,
				15179644549,
				58533795373,
				4434812905,
				20743912811,
				31920827745,
				42332552509,
				64106723953,
				61987860015,
				18286833283,
				49956032501,
				13203889835,
				29235312165,
				36521555341,
				37903965709,
				11787234849,
				57448344684,
				18958239524,
				36489129683,
				17809534842,
				32896732754,
				31847577168,
				41236569844,
				33564302914,
				51585414251,
				39285898823,
				8882101696,
				42729360772,
				251636777,
				33075363724,
				27518016937,
				55852068415,
				7734342848,
				40004287547,
				66652317552,
				15292841334,
				14569959493,
				55326630930,
				32846929320,
				5603651436,
				25389875160,
				48026662697,
				918846935,
				49642306667,
				3924358743,
				57089912602,
				36525866802,
				19258047537,
				15798762340,
				29623485812,
				13931892113,
				11469315373,
				37306662699,
				61910613086,
				30606478781,
				46814571538,
				4917445926,
				4439324737,
				60918689504,
				47457428851,
				68021616262,
				18332513560,
				51148727658,
				27928255740,
				46173761192,
				40760335900,
				7855435272,
				7001299726,
				61833121153,
				43896074151,
				14605260403,
				62541610373,
				12393639381,
				37350739731,
				66194071346,
				18666749070,
				12382112924,
				1680236413,
				16493370640,
				6059486961,
				16751996745,
				21543890275,
				7001355285,
				27046496066,
				2804870197,
				8337874016,
				45455359079,
				65272880397,
				9060569084,
				60159882672,
				20975334688,
				45716885065,
				60604533827,
				8739419880,
				35574477989,
				42573002072,
				11905513436,
				39802521107,
				35050605614,
				81139249,
				55923865609,
				42972972333,
				38492698169,
				54935698999,
				54512761978,
				67740646995,
				41511353392,
				50981879100,
				60163858300,
				20282826672,
				49415583287,
				13921455465,
				4465851981,
				53900345171,
				59632123755,
				19009048020,
				13643781953,
				30188444676,
				20762705568
			]
		}
	};
	AR.Dictionary = function(dicName) {
		this.codes = {};
		this.codeList = [];
		this.tau = 0;
		this._initialize(dicName);
	};
	AR.Dictionary.prototype._initialize = function(dicName) {
		this.codes = {};
		this.codeList = [];
		this.tau = 0;
		this.nBits = 0;
		this.markSize = 0;
		this.dicName = dicName;
		var dictionary = AR.DICTIONARIES[dicName];
		if (!dictionary) throw "The dictionary \"" + dicName + "\" is not recognized.";
		this.nBits = dictionary.nBits;
		this.markSize = Math.sqrt(dictionary.nBits) + 2;
		for (var i = 0; i < dictionary.codeList.length; i++) {
			var code = null;
			if (typeof dictionary.codeList[i] === "number") code = this._hex2bin(dictionary.codeList[i], dictionary.nBits);
			if (typeof dictionary.codeList[i] === "string") code = this._hex2bin(parseInt(dictionary.codeList[i], 16), dictionary.nBits);
			if (Array.isArray(dictionary.codeList[i])) code = this._bytes2bin(dictionary.codeList[i], dictionary.nBits);
			if (code === null) throw "Invalid code " + i + " in dictionary " + dicName + ": " + JSON.stringify(dictionary.codeList[i]);
			if (code.length != dictionary.nBits) throw "The code " + i + " in dictionary " + dicName + " is not " + dictionary.nBits + " bits long but " + code.length + ": " + code;
			this.codeList.push(code);
			this.codes[code] = { id: i };
		}
		this.tau = dictionary.tau || this._calculateTau();
	};
	AR.Dictionary.prototype.find = function(bits) {
		var val = "", i = 0, j;
		for (; i < bits.length; i++) {
			var bitRow = bits[i];
			for (j = 0; j < bitRow.length; j++) val += bitRow[j];
		}
		var minFound = this.codes[val];
		if (minFound) return {
			id: minFound.id,
			distance: 0
		};
		for (i = 0; i < this.codeList.length; i++) {
			var code = this.codeList[i];
			var distance = this._hammingDistance(val, code);
			if (this._hammingDistance(val, code) < this.tau) {
				if (!minFound || minFound.distance > distance) minFound = {
					id: this.codes[code].id,
					distance
				};
			}
		}
		return minFound;
	};
	AR.Dictionary.prototype._hex2bin = function(hex, nBits) {
		return hex.toString(2).padStart(nBits, "0");
	};
	AR.Dictionary.prototype._bytes2bin = function(byteList, nBits) {
		var bits = "", byte;
		for (byte of byteList) bits += byte.toString(2).padStart(bits.length + 8 > nBits ? nBits - bits.length : 8, "0");
		return bits;
	};
	AR.Dictionary.prototype._hammingDistance = function(str1, str2) {
		if (str1.length != str2.length) throw "Hamming distance calculation require inputs of the same length";
		var distance = 0, i = 0;
		for (; i < str1.length; i++) if (str1[i] !== str2[i]) distance += 1;
		return distance;
	};
	AR.Dictionary.prototype._calculateTau = function() {
		var tau = Number.MAX_VALUE;
		for (var i = 0; i < this.codeList.length; i++) for (var j = i + 1; j < this.codeList.length; j++) {
			var distance = this._hammingDistance(this.codeList[i], this.codeList[j]);
			tau = distance < tau ? distance : tau;
		}
		return tau;
	};
	AR.Dictionary.prototype.generateSVG = function(id) {
		var code = this.codeList[id];
		if (code == null) throw "The id \"" + id + "\" is not valid for the dictionary \"" + this.dicName + "\". ID must be between 0 and " + (this.codeList.length - 1) + " included.";
		var size = this.markSize - 2;
		var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + (size + 4) + " " + (size + 4) + "\">";
		svg += "<rect x=\"0\" y=\"0\" width=\"" + (size + 4) + "\" height=\"" + (size + 4) + "\" fill=\"white\"/>";
		svg += "<rect x=\"1\" y=\"1\" width=\"" + (size + 2) + "\" height=\"" + (size + 2) + "\" fill=\"black\"/>";
		for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (code[y * size + x] == "1") svg += "<rect x=\"" + (x + 2) + "\" y=\"" + (y + 2) + "\" width=\"1\" height=\"1\" fill=\"white\"/>";
		svg += "</svg>";
		return svg;
	};
	AR.Marker = function(id, corners, hammingDistance) {
		this.id = id;
		this.corners = corners;
		this.hammingDistance = hammingDistance;
	};
	AR.Detector = function(config) {
		config = config || {};
		this.grey = new CV.Image();
		this.thres = new CV.Image();
		this.homography = new CV.Image();
		this.binary = [];
		this.contours = [];
		this.polys = [];
		this.candidates = [];
		config.dictionaryName = config.dictionaryName || "ARUCO_MIP_36h12";
		this.dictionary = new AR.Dictionary(config.dictionaryName);
		this.dictionary.tau = config.maxHammingDistance != null ? config.maxHammingDistance : this.dictionary.tau;
	};
	AR.Detector.prototype.detectImage = function(width, height, data) {
		return this.detect({
			width,
			height,
			data
		});
	};
	AR.Detector.prototype.detectStreamInit = function(width, height, callback) {
		this.streamConfig = {};
		this.streamConfig.width = width;
		this.streamConfig.height = height;
		this.streamConfig.imageSize = width * height * 4;
		this.streamConfig.index = 0;
		this.streamConfig.imageData = new Uint8ClampedArray(this.streamConfig.imageSize);
		this.streamConfig.callback = callback || function(image, markerList) {};
	};
	AR.Detector.prototype.detectStream = function(data) {
		for (var i = 0; i < data.length; i++) {
			this.streamConfig.imageData[this.streamConfig.index] = data[i];
			this.streamConfig.index = (this.streamConfig.index + 1) % this.streamConfig.imageSize;
			if (this.streamConfig.index == 0) {
				var image = {
					width: this.streamConfig.width,
					height: this.streamConfig.height,
					data: this.streamConfig.imageData
				};
				var markerList = this.detect(image);
				this.streamConfig.callback(image, markerList);
			}
		}
	};
	AR.Detector.prototype.detectMJPEGStreamInit = function(width, height, callback, decoderFn) {
		this.mjpeg = {
			decoderFn,
			chunks: [],
			SOI: [255, 216],
			EOI: [255, 217]
		};
		this.detectStreamInit(width, height, callback);
	};
	AR.Detector.prototype.detectMJPEGStream = function(chunk) {
		var eoiPos = chunk.findIndex(function(element, index, array) {
			return this.mjpeg.EOI[0] == element && array.length > index + 1 && this.mjpeg.EOI[1] == array[index + 1];
		});
		var soiPos = chunk.findIndex(function(element, index, array) {
			return this.mjpeg.SOI[0] == element && array.length > index + 1 && this.mjpeg.SOI[1] == array[index + 1];
		});
		if (eoiPos === -1) this.mjpeg.chunks.push(chunk);
		else {
			var part1 = chunk.slice(0, eoiPos + 2);
			if (part1.length) this.mjpeg.chunks.push(part1);
			if (this.mjpeg.chunks.length) {
				var jpegImage = this.mjpeg.chunks.flat();
				var rgba = this.mjpeg.decoderFn(jpegImage);
				this.detectStream(rgba);
			}
			this.mjpeg.chunks = [];
		}
		if (soiPos > -1) {
			this.mjpeg.chunks = [];
			this.mjpeg.chunks.push(chunk.slice(soiPos));
		}
	};
	AR.Detector.prototype.detect = function(image) {
		CV.grayscale(image, this.grey);
		CV.adaptiveThreshold(this.grey, this.thres, 2, 7);
		this.contours = CV.findContours(this.thres, this.binary);
		this.candidates = this.findCandidates(this.contours, image.width * .01, .05, 10);
		this.candidates = this.clockwiseCorners(this.candidates);
		this.candidates = this.notTooNear(this.candidates, 10);
		return this.findMarkers(this.grey, this.candidates, 49);
	};
	AR.Detector.prototype.findCandidates = function(contours, minSize, epsilon, minLength) {
		var candidates = [], len = contours.length, contour, poly, i;
		this.polys = [];
		for (i = 0; i < len; ++i) {
			contour = contours[i];
			if (contour.length >= minSize) {
				poly = CV.approxPolyDP(contour, contour.length * epsilon);
				this.polys.push(poly);
				if (4 === poly.length && CV.isContourConvex(poly)) {
					if (CV.minEdgeLength(poly) >= minLength) candidates.push(poly);
				}
			}
		}
		return candidates;
	};
	AR.Detector.prototype.clockwiseCorners = function(candidates) {
		var len = candidates.length, dx1, dx2, dy1, dy2, swap, i = 0;
		for (; i < len; ++i) {
			dx1 = candidates[i][1].x - candidates[i][0].x;
			dy1 = candidates[i][1].y - candidates[i][0].y;
			dx2 = candidates[i][2].x - candidates[i][0].x;
			dy2 = candidates[i][2].y - candidates[i][0].y;
			if (dx1 * dy2 - dy1 * dx2 < 0) {
				swap = candidates[i][1];
				candidates[i][1] = candidates[i][3];
				candidates[i][3] = swap;
			}
		}
		return candidates;
	};
	AR.Detector.prototype.notTooNear = function(candidates, minDist) {
		var notTooNear = [], len = candidates.length, dist, dx, dy, i = 0, j, k;
		for (; i < len; ++i) for (j = i + 1; j < len; ++j) {
			dist = 0;
			for (k = 0; k < 4; ++k) {
				dx = candidates[i][k].x - candidates[j][k].x;
				dy = candidates[i][k].y - candidates[j][k].y;
				dist += dx * dx + dy * dy;
			}
			if (dist / 4 < minDist * minDist) {
				if (CV.perimeter(candidates[i]) < CV.perimeter(candidates[j])) candidates[i].tooNear = true;
				else candidates[j].tooNear = true;
			}
		}
		for (i = 0; i < len; ++i) if (!candidates[i].tooNear) notTooNear.push(candidates[i]);
		return notTooNear;
	};
	AR.Detector.prototype.findMarkers = function(imageSrc, candidates, warpSize) {
		var markers = [], len = candidates.length, candidate, marker, i = 0;
		for (; i < len; ++i) {
			candidate = candidates[i];
			CV.warp(imageSrc, this.homography, candidate, warpSize);
			CV.threshold(this.homography, this.homography, CV.otsu(this.homography));
			marker = this.getMarker(this.homography, candidate);
			if (marker) markers.push(marker);
		}
		return markers;
	};
	AR.Detector.prototype.getMarker = function(imageSrc, candidate) {
		var markSize = this.dictionary.markSize;
		var width = imageSrc.width / markSize >>> 0, minZero = width * width >> 1, bits = [], rotations = [], square, inc, i = 0, j;
		for (; i < markSize; ++i) {
			inc = 0 === i || markSize - 1 === i ? 1 : markSize - 1;
			for (j = 0; j < markSize; j += inc) {
				square = {
					x: j * width,
					y: i * width,
					width,
					height: width
				};
				if (CV.countNonZero(imageSrc, square) > minZero) return null;
			}
		}
		for (i = 0; i < markSize - 2; ++i) {
			bits[i] = [];
			for (j = 0; j < markSize - 2; ++j) {
				square = {
					x: (j + 1) * width,
					y: (i + 1) * width,
					width,
					height: width
				};
				bits[i][j] = CV.countNonZero(imageSrc, square) > minZero ? 1 : 0;
			}
		}
		rotations[0] = bits;
		var foundMin = null;
		var rot = 0;
		for (i = 0; i < 4; i++) {
			var found = this.dictionary.find(rotations[i]);
			if (found && (foundMin === null || found.distance < foundMin.distance)) {
				foundMin = found;
				rot = i;
				if (foundMin.distance === 0) break;
			}
			rotations[i + 1] = this.rotate(rotations[i]);
		}
		if (foundMin) return new AR.Marker(foundMin.id, this.rotate2(candidate, 4 - rot), foundMin.distance);
		return null;
	};
	AR.Detector.prototype.rotate = function(src) {
		var dst = [], len = src.length, i = 0, j;
		for (; i < len; ++i) {
			dst[i] = [];
			for (j = 0; j < src[i].length; ++j) dst[i][j] = src[src[i].length - j - 1][i];
		}
		return dst;
	};
	AR.Detector.prototype.rotate2 = function(src, rotation) {
		var dst = [], len = src.length, i = 0;
		for (; i < len; ++i) dst[i] = src[(rotation + i) % len];
		return dst;
	};
}));
// node_modules/js-aruco2/src/dictionaries/aruco_4x4_1000.js
var require_aruco_4x4_1000 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var AR = exports.AR || require_aruco().AR;
	AR.DICTIONARIES["ARUCO_4X4_1000"] = {
		nBits: 16,
		tau: null,
		codeList: [
			[181, 50],
			[15, 154],
			[51, 45],
			[153, 70],
			[84, 158],
			[121, 205],
			[158, 46],
			[196, 242],
			[254, 218],
			[207, 86],
			[249, 145],
			[17, 167],
			[14, 183],
			[42, 15],
			[36, 177],
			[38, 62],
			[70, 101],
			[102, 0],
			[108, 94],
			[118, 175],
			[134, 139],
			[176, 43],
			[204, 213],
			[221, 130],
			[254, 71],
			[148, 113],
			[172, 228],
			[165, 84],
			[33, 35],
			[52, 111],
			[68, 21],
			[87, 178],
			[158, 207],
			[240, 203],
			[8, 174],
			[9, 41],
			[24, 117],
			[4, 255],
			[13, 246],
			[28, 90],
			[23, 24],
			[42, 40],
			[50, 140],
			[56, 178],
			[36, 232],
			[46, 235],
			[45, 63],
			[75, 100],
			[80, 46],
			[80, 19],
			[81, 148],
			[85, 104],
			[93, 65],
			[95, 151],
			[104, 1],
			[104, 103],
			[97, 36],
			[97, 233],
			[107, 18],
			[111, 229],
			[103, 223],
			[126, 27],
			[128, 160],
			[131, 68],
			[139, 162],
			[147, 122],
			[132, 108],
			[133, 42],
			[133, 156],
			[156, 137],
			[159, 161],
			[187, 124],
			[188, 4],
			[182, 91],
			[191, 200],
			[183, 171],
			[202, 31],
			[201, 98],
			[217, 88],
			[211, 213],
			[204, 152],
			[199, 160],
			[197, 55],
			[233, 93],
			[249, 37],
			[251, 187],
			[238, 42],
			[247, 77],
			[53, 117],
			[138, 173],
			[118, 23],
			[10, 207],
			[6, 75],
			[45, 193],
			[73, 216],
			[67, 244],
			[79, 54],
			[79, 211],
			[105, 228],
			[112, 199],
			[122, 110],
			[180, 234],
			[237, 79],
			[252, 231],
			[254, 166],
			[0, 37],
			[0, 67],
			[10, 136],
			[10, 134],
			[2, 111],
			[0, 28],
			[0, 151],
			[8, 55],
			[10, 49],
			[9, 198],
			[11, 1],
			[9, 251],
			[11, 88],
			[16, 130],
			[24, 45],
			[16, 120],
			[16, 115],
			[18, 116],
			[18, 177],
			[26, 249],
			[19, 6],
			[12, 14],
			[12, 241],
			[4, 51],
			[12, 159],
			[14, 242],
			[14, 253],
			[7, 76],
			[15, 164],
			[7, 47],
			[5, 181],
			[15, 145],
			[7, 219],
			[30, 228],
			[20, 57],
			[29, 128],
			[21, 200],
			[31, 139],
			[21, 186],
			[29, 177],
			[32, 128],
			[40, 233],
			[34, 162],
			[40, 83],
			[42, 240],
			[34, 247],
			[41, 64],
			[33, 70],
			[41, 185],
			[43, 156],
			[43, 178],
			[56, 202],
			[56, 46],
			[48, 7],
			[56, 231],
			[58, 73],
			[58, 101],
			[50, 93],
			[59, 136],
			[57, 29],
			[59, 211],
			[38, 71],
			[39, 128],
			[47, 170],
			[45, 20],
			[37, 222],
			[37, 83],
			[47, 119],
			[52, 72],
			[60, 168],
			[60, 65],
			[52, 13],
			[52, 251],
			[54, 154],
			[61, 224],
			[53, 106],
			[61, 9],
			[61, 237],
			[63, 196],
			[63, 108],
			[55, 206],
			[61, 92],
			[61, 118],
			[55, 176],
			[63, 23],
			[63, 255],
			[72, 229],
			[66, 104],
			[74, 45],
			[65, 96],
			[73, 81],
			[65, 221],
			[75, 223],
			[88, 79],
			[90, 72],
			[88, 22],
			[80, 93],
			[90, 250],
			[90, 181],
			[81, 35],
			[91, 138],
			[89, 25],
			[81, 53],
			[76, 105],
			[70, 193],
			[78, 11],
			[68, 95],
			[78, 89],
			[77, 131],
			[77, 125],
			[71, 216],
			[71, 115],
			[92, 133],
			[94, 68],
			[86, 43],
			[92, 187],
			[85, 195],
			[95, 110],
			[95, 235],
			[93, 18],
			[85, 94],
			[98, 112],
			[98, 21],
			[97, 194],
			[107, 32],
			[99, 69],
			[107, 92],
			[107, 91],
			[120, 12],
			[122, 207],
			[120, 127],
			[121, 128],
			[113, 229],
			[113, 116],
			[121, 182],
			[113, 211],
			[123, 51],
			[100, 106],
			[102, 168],
			[110, 167],
			[110, 145],
			[101, 34],
			[109, 203],
			[103, 141],
			[109, 49],
			[126, 128],
			[126, 226],
			[126, 141],
			[116, 210],
			[124, 50],
			[126, 53],
			[117, 171],
			[119, 5],
			[127, 43],
			[125, 218],
			[127, 146],
			[128, 117],
			[128, 243],
			[129, 166],
			[137, 237],
			[129, 252],
			[152, 166],
			[154, 32],
			[145, 67],
			[153, 249],
			[145, 147],
			[155, 212],
			[132, 9],
			[132, 107],
			[134, 196],
			[142, 100],
			[134, 26],
			[133, 78],
			[141, 203],
			[133, 103],
			[133, 175],
			[133, 215],
			[135, 179],
			[156, 225],
			[156, 242],
			[148, 23],
			[149, 0],
			[149, 162],
			[157, 35],
			[159, 98],
			[157, 82],
			[149, 218],
			[160, 197],
			[170, 205],
			[162, 216],
			[162, 87],
			[169, 61],
			[169, 87],
			[171, 82],
			[163, 54],
			[163, 89],
			[176, 244],
			[184, 18],
			[176, 191],
			[178, 157],
			[187, 237],
			[185, 114],
			[185, 150],
			[164, 195],
			[172, 210],
			[174, 177],
			[165, 130],
			[175, 101],
			[165, 123],
			[175, 250],
			[180, 100],
			[188, 98],
			[180, 129],
			[182, 160],
			[190, 238],
			[190, 13],
			[188, 217],
			[190, 248],
			[181, 40],
			[183, 9],
			[183, 210],
			[192, 234],
			[192, 25],
			[192, 253],
			[200, 211],
			[202, 90],
			[193, 77],
			[201, 180],
			[193, 87],
			[195, 152],
			[195, 29],
			[216, 128],
			[216, 239],
			[218, 43],
			[208, 30],
			[209, 5],
			[211, 173],
			[219, 167],
			[196, 201],
			[204, 120],
			[205, 69],
			[197, 11],
			[207, 207],
			[220, 172],
			[212, 2],
			[220, 99],
			[212, 39],
			[212, 245],
			[214, 120],
			[222, 184],
			[221, 230],
			[213, 93],
			[221, 189],
			[223, 29],
			[226, 202],
			[234, 107],
			[224, 180],
			[226, 56],
			[226, 212],
			[227, 34],
			[225, 216],
			[240, 3],
			[242, 204],
			[248, 246],
			[241, 73],
			[243, 234],
			[241, 156],
			[249, 245],
			[241, 59],
			[236, 141],
			[238, 201],
			[230, 15],
			[228, 247],
			[231, 96],
			[239, 232],
			[237, 178],
			[229, 21],
			[239, 209],
			[244, 134],
			[252, 1],
			[246, 195],
			[244, 124],
			[252, 147],
			[245, 66],
			[253, 152],
			[245, 61],
			[2, 189],
			[0, 225],
			[2, 226],
			[2, 174],
			[8, 120],
			[0, 116],
			[8, 158],
			[8, 209],
			[8, 125],
			[10, 50],
			[10, 222],
			[2, 81],
			[1, 162],
			[3, 128],
			[11, 131],
			[11, 75],
			[11, 39],
			[11, 239],
			[9, 182],
			[9, 89],
			[9, 147],
			[11, 248],
			[3, 217],
			[3, 241],
			[16, 196],
			[24, 171],
			[26, 160],
			[26, 4],
			[26, 108],
			[26, 174],
			[18, 137],
			[16, 23],
			[26, 243],
			[25, 64],
			[17, 2],
			[17, 43],
			[17, 207],
			[27, 34],
			[19, 46],
			[17, 21],
			[19, 187],
			[12, 32],
			[12, 201],
			[12, 220],
			[12, 54],
			[6, 20],
			[6, 114],
			[13, 97],
			[5, 13],
			[13, 143],
			[15, 224],
			[15, 73],
			[7, 133],
			[5, 144],
			[13, 51],
			[15, 150],
			[15, 118],
			[20, 96],
			[28, 141],
			[20, 218],
			[28, 115],
			[30, 148],
			[30, 186],
			[22, 217],
			[30, 61],
			[22, 251],
			[29, 233],
			[29, 254],
			[31, 159],
			[40, 139],
			[32, 175],
			[34, 14],
			[34, 169],
			[42, 141],
			[42, 163],
			[42, 239],
			[40, 144],
			[40, 59],
			[42, 88],
			[34, 51],
			[33, 160],
			[33, 2],
			[33, 165],
			[33, 199],
			[43, 3],
			[35, 103],
			[41, 48],
			[41, 210],
			[43, 25],
			[43, 155],
			[43, 151],
			[56, 40],
			[56, 165],
			[58, 134],
			[50, 1],
			[56, 159],
			[50, 210],
			[58, 153],
			[58, 213],
			[57, 232],
			[59, 193],
			[51, 67],
			[59, 231],
			[49, 154],
			[51, 144],
			[59, 158],
			[36, 196],
			[44, 74],
			[44, 173],
			[44, 207],
			[44, 103],
			[38, 234],
			[46, 229],
			[44, 112],
			[46, 18],
			[46, 209],
			[46, 57],
			[37, 100],
			[37, 231],
			[47, 204],
			[45, 188],
			[45, 113],
			[37, 213],
			[37, 155],
			[39, 16],
			[47, 124],
			[39, 242],
			[39, 58],
			[47, 182],
			[39, 211],
			[47, 179],
			[39, 31],
			[60, 75],
			[54, 192],
			[54, 238],
			[62, 233],
			[52, 184],
			[60, 20],
			[60, 82],
			[52, 114],
			[52, 126],
			[52, 191],
			[62, 113],
			[62, 83],
			[61, 140],
			[53, 162],
			[53, 46],
			[53, 45],
			[55, 172],
			[53, 112],
			[55, 250],
			[63, 241],
			[63, 219],
			[72, 196],
			[72, 233],
			[74, 194],
			[74, 65],
			[66, 235],
			[72, 19],
			[74, 216],
			[66, 253],
			[74, 23],
			[73, 99],
			[67, 110],
			[65, 58],
			[73, 177],
			[65, 61],
			[75, 146],
			[75, 155],
			[67, 63],
			[88, 34],
			[80, 170],
			[88, 39],
			[82, 200],
			[82, 132],
			[82, 10],
			[90, 15],
			[88, 152],
			[88, 92],
			[80, 219],
			[80, 247],
			[90, 244],
			[81, 236],
			[81, 66],
			[81, 13],
			[91, 3],
			[83, 235],
			[81, 118],
			[89, 113],
			[81, 147],
			[83, 249],
			[91, 179],
			[83, 151],
			[76, 76],
			[68, 75],
			[76, 35],
			[70, 140],
			[78, 39],
			[70, 144],
			[78, 212],
			[69, 206],
			[69, 229],
			[69, 39],
			[79, 193],
			[71, 5],
			[69, 52],
			[69, 114],
			[92, 200],
			[92, 14],
			[84, 235],
			[86, 137],
			[86, 67],
			[94, 231],
			[92, 112],
			[84, 178],
			[94, 121],
			[86, 243],
			[93, 163],
			[93, 242],
			[85, 29],
			[93, 157],
			[87, 252],
			[87, 210],
			[95, 115],
			[104, 45],
			[104, 195],
			[104, 135],
			[106, 74],
			[98, 105],
			[96, 185],
			[104, 255],
			[106, 220],
			[106, 218],
			[106, 62],
			[106, 81],
			[106, 49],
			[98, 215],
			[97, 204],
			[107, 130],
			[107, 227],
			[105, 58],
			[97, 158],
			[97, 149],
			[97, 117],
			[105, 95],
			[105, 55],
			[99, 218],
			[112, 2],
			[120, 99],
			[112, 79],
			[114, 202],
			[122, 173],
			[112, 123],
			[122, 20],
			[122, 249],
			[122, 211],
			[122, 187],
			[121, 226],
			[113, 41],
			[123, 103],
			[113, 208],
			[121, 57],
			[115, 48],
			[115, 185],
			[115, 83],
			[115, 255],
			[108, 136],
			[100, 9],
			[108, 67],
			[102, 6],
			[102, 131],
			[100, 176],
			[100, 218],
			[110, 159],
			[103, 200],
			[111, 238],
			[109, 59],
			[111, 210],
			[116, 128],
			[124, 171],
			[126, 104],
			[126, 2],
			[124, 156],
			[116, 54],
			[124, 17],
			[126, 222],
			[126, 182],
			[118, 219],
			[125, 196],
			[125, 138],
			[117, 109],
			[119, 136],
			[119, 32],
			[119, 65],
			[117, 56],
			[117, 190],
			[125, 155],
			[119, 87],
			[136, 40],
			[128, 172],
			[136, 13],
			[136, 103],
			[130, 78],
			[138, 161],
			[130, 43],
			[128, 24],
			[136, 249],
			[128, 157],
			[138, 156],
			[130, 49],
			[138, 117],
			[130, 151],
			[129, 9],
			[129, 235],
			[129, 7],
			[139, 40],
			[139, 172],
			[131, 46],
			[131, 229],
			[129, 80],
			[137, 50],
			[139, 122],
			[139, 150],
			[131, 125],
			[144, 135],
			[154, 252],
			[146, 245],
			[145, 170],
			[147, 65],
			[147, 37],
			[155, 235],
			[153, 52],
			[145, 247],
			[155, 218],
			[147, 86],
			[132, 66],
			[140, 129],
			[140, 79],
			[134, 72],
			[134, 166],
			[142, 3],
			[134, 227],
			[134, 111],
			[142, 175],
			[132, 94],
			[132, 119],
			[134, 250],
			[142, 30],
			[142, 55],
			[135, 10],
			[143, 138],
			[143, 38],
			[135, 33],
			[135, 13],
			[133, 114],
			[135, 62],
			[156, 67],
			[158, 97],
			[148, 88],
			[148, 248],
			[156, 50],
			[148, 118],
			[148, 177],
			[148, 221],
			[148, 155],
			[156, 219],
			[158, 156],
			[158, 210],
			[150, 25],
			[158, 177],
			[149, 105],
			[159, 109],
			[151, 43],
			[149, 182],
			[149, 185],
			[157, 61],
			[157, 87],
			[168, 236],
			[168, 37],
			[162, 172],
			[162, 2],
			[170, 102],
			[170, 143],
			[170, 231],
			[168, 48],
			[168, 122],
			[168, 246],
			[168, 147],
			[162, 20],
			[170, 52],
			[162, 114],
			[170, 242],
			[162, 241],
			[161, 64],
			[169, 10],
			[161, 38],
			[169, 197],
			[169, 207],
			[161, 52],
			[169, 18],
			[161, 250],
			[171, 152],
			[163, 247],
			[176, 6],
			[176, 69],
			[184, 141],
			[178, 132],
			[184, 240],
			[184, 85],
			[178, 118],
			[186, 145],
			[178, 113],
			[185, 192],
			[185, 66],
			[185, 42],
			[179, 140],
			[179, 202],
			[187, 102],
			[179, 15],
			[177, 218],
			[187, 20],
			[187, 246],
			[179, 19],
			[164, 104],
			[172, 44],
			[172, 161],
			[172, 235],
			[172, 199],
			[164, 103],
			[166, 192],
			[174, 224],
			[166, 35],
			[173, 232],
			[165, 204],
			[167, 236],
			[173, 124],
			[165, 26],
			[165, 145],
			[173, 25],
			[165, 151],
			[180, 109],
			[190, 203],
			[188, 58],
			[188, 245],
			[190, 189],
			[190, 243],
			[181, 37],
			[181, 143],
			[183, 104],
			[191, 228],
			[189, 254],
			[189, 157],
			[181, 245],
			[181, 243],
			[191, 176],
			[183, 90],
			[191, 62],
			[183, 57],
			[191, 213],
			[183, 29],
			[191, 53],
			[183, 127],
			[200, 1],
			[192, 165],
			[194, 130],
			[200, 189],
			[194, 252],
			[202, 145],
			[194, 91],
			[201, 68],
			[193, 42],
			[195, 192],
			[201, 122],
			[193, 185],
			[201, 117],
			[193, 247],
			[203, 177],
			[208, 108],
			[216, 135],
			[208, 175],
			[218, 196],
			[210, 12],
			[218, 9],
			[208, 48],
			[216, 148],
			[208, 58],
			[208, 182],
			[208, 117],
			[210, 118],
			[218, 93],
			[218, 53],
			[210, 23],
			[217, 2],
			[211, 232],
			[211, 229],
			[209, 154],
			[209, 246],
			[209, 81],
			[219, 20],
			[211, 62],
			[211, 211],
			[196, 96],
			[204, 167],
			[198, 66],
			[198, 71],
			[206, 231],
			[196, 92],
			[204, 29],
			[204, 53],
			[198, 188],
			[205, 168],
			[197, 12],
			[197, 228],
			[197, 194],
			[205, 45],
			[205, 89],
			[205, 149],
			[197, 147],
			[199, 95],
			[212, 197],
			[222, 136],
			[214, 36],
			[222, 236],
			[214, 226],
			[222, 198],
			[222, 35],
			[220, 220],
			[220, 26],
			[212, 17],
			[222, 84],
			[214, 148],
			[222, 157],
			[221, 129],
			[213, 165],
			[215, 172],
			[215, 102],
			[223, 169],
			[213, 220],
			[221, 31],
			[223, 240],
			[226, 72],
			[226, 232],
			[226, 7],
			[224, 93],
			[234, 245],
			[235, 38],
			[235, 237],
			[225, 82],
			[225, 126],
			[233, 219],
			[248, 6],
			[240, 238],
			[248, 161],
			[250, 0],
			[250, 194],
			[240, 155],
			[250, 244],
			[250, 60],
			[242, 252],
			[242, 189],
			[242, 147],
			[241, 96],
			[249, 236],
			[241, 70],
			[249, 225],
			[243, 72],
			[243, 174],
			[243, 193],
			[243, 139],
			[243, 167],
			[241, 115],
			[241, 151],
			[243, 244],
			[251, 50],
			[228, 7],
			[230, 77],
			[236, 85],
			[237, 192],
			[237, 133],
			[239, 162],
			[231, 78],
			[229, 213],
			[239, 80],
			[244, 34],
			[244, 137],
			[244, 41],
			[246, 106],
			[254, 11],
			[254, 111],
			[244, 149],
			[244, 53],
			[244, 31],
			[246, 176],
			[245, 232],
			[245, 197],
			[253, 35],
			[255, 192],
			[247, 204],
			[247, 233],
			[245, 188],
			[253, 246],
			[245, 217],
			[253, 151],
			[253, 63],
			[255, 156],
			[255, 90],
			[247, 254],
			[255, 17],
			[247, 191]
		]
	};
}));
// scripts/aruco-entry.cjs
var require_aruco_entry = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var { AR } = require_aruco();
	require_aruco_4x4_1000();
	module.exports = { AR };
}));
export default require_aruco_entry();
