import { computeFrame } from '../lib/scale.js';
import { PRODUCTS } from './products.js';
export const SHOE_FRAME = computeFrame(PRODUCTS.map((p)=>p.image));


//# sourceURL=src\data\frame.ts