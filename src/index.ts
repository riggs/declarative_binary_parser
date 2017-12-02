export {hex, hex_buffer} from './serialization';
export {
    Context_Array,
    Context_Map,
    Encoder,
    Decoder,
    inspect,
    Bits,
    Uint,
    Int,
    Float,
    Utf8,
    Embed,
    Byte_Array,
    Byte_Map,
    Repeat,
    Branch,
    Padding
} from './transcode';

import {Uint, Int, Float, Padding, Struct} from './transcode';

export const Uint8 = Uint(8);
export const Uint16 = Uint(16);
export const Uint16LE = Uint(16, {little_endian: true});
export const Uint32 = Uint(32);
export const Uint32LE = Uint(32, {little_endian: true});
export const Uint64 = Uint(64);
export const Uint64LE = Uint(64, {little_endian: true});

export const Int8 = Int(8);
export const Int16 = Int(8);
export const Int16LE = Int(16, {little_endian: true});
export const Int32 = Int(32);
export const Int32LE = Int(32, {little_endian: true});

export const Float32 = Float(32);
export const Float32LE = Float(32, {little_endian: true});
export const Float64 = Float(64);
export const Float64LE = Float(64, {little_endian: true});

/** Noöp structure
 *
 * @type {Struct}
 */
export const Pass = Padding();
