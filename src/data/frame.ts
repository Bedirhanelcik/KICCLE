/**
 * The single shared shoe frame. Computed from every product image so that all
 * ten sneakers render at the same visible width on the same sole baseline.
 */
import { computeFrame, type ShoeFrame } from '../lib/scale.js';
import { PRODUCTS } from './products.js';

export const SHOE_FRAME: ShoeFrame = computeFrame(PRODUCTS.map((p) => p.image));
