import 'improved-map';

import {
    Bits_Sizes,
    Uint_Sizes,
    Int_Sizes,
    Float_Sizes,
    Size,
    Serializer,
    Deserializer,
    uint_pack,
    int_pack,
    float_pack,
    uint_parse,
    int_parse,
    float_parse,
    utf8_pack,
    utf8_parse,
    hex_buffer
} from './serialization';

export type Primitive = number | string | ArrayBuffer;

export type Mapped<T> = Map<string, T>;

export type Encoded_Map = Mapped<any>;
export type Encoded_Array = Array<any>;
export type Encoded = Primitive | Encoded_Map | Encoded_Array;

export type Map_Context = Encoded_Map;
export type Array_Context = Encoded_Array;
export type Context = Encoded;

export const Parent = Symbol("Parent");

export interface Contextualized<P> {
    [Parent]?: P;
}

const set_context = <E extends (Encoded_Map | Encoded_Array), C>(data: E, context?: C): Context_Type<E, C> => {
    if ( context !== undefined ) {
        ( data as Context_Type<E, C> )[Parent] = context;
    }
    return data as Context_Type<E, C>;
};

const remove_context = <T extends (Encoded_Map | Encoded_Array), C>(data: T, delete_flag: boolean): T => {
    if ( delete_flag ) {
        delete ( data as Context_Type<T, C> )[Parent];
    }
    return data;
};

/* Context needs to be imposed at the Struct level to support Repeat & Byte_Buffer */
export type Context_Type<E extends Encoded, C> = E & Contextualized<C>;

export type Context_Map<Encoded, Context> = Context_Type<Mapped<Encoded>, Context>;

export type Context_Array<Encoded, Context> = Context_Type<Array<Encoded>, Context>;

/* Used by Embed */
export type Context_Iterable<Encoded, Context> = Context_Map<Encoded, Context> | Context_Array<Encoded, Context>;

/* These functions provided by library consumer to convert data to usable structures. */
export type Encoder<Decoded, E extends Encoded, Context> = (decoded: Decoded, context?: Context) => E;
export type Decoder<E extends Encoded, Decoded, Context> = (encoded: E, context?: Context) => Decoded;

export interface Transcoders<E extends Encoded, Decoded, Context> {
    encode?: Encoder<Decoded, E, Context>;
    decode?: Decoder<E, Decoded, Context>;
    little_endian?: boolean;
}

export const inspect_transcoder = <T>(data: T, context?: any): T => {
    console.log({ data, context });
    return data
};

export const inspect = {
    encode: inspect_transcoder,
    decode: inspect_transcoder,
};

/** A function to fetch the data to be packed.
 *  It is provided by the code handling the input data and called by the packer function to fetch the data to pack.
 */
export interface Fetcher<Decoded> {
    (): Decoded;
}

/** A function to deliver the parsed result to the correct place.
 *  It is provided by the code managing the results container and called by the parser function with the parsed data.
 */
export interface Deliver<Decoded> {
    (data: Decoded): void;
}

export interface Parse_Options<Context> {
    byte_offset?: number;
    little_endian?: boolean;
    context?: Context;
}

export interface Pack_Options<C> extends Parse_Options<C> {
    data_view?: DataView;
}

export interface Packed {
    buffer: ArrayBuffer;
    size: Size; /* In Bytes */
}

export interface Parsed<Decoded> {
    data: Decoded;
    size: Size; /* In Bytes */
}

export interface Packer<Decoded, Context> {
    (source: Decoded | Fetcher<Decoded>, options?: Pack_Options<Context>): Packed;
}

export interface Parser<Decoded, Context> {
    (data_view: DataView, options?: Parse_Options<Context>, deliver?: Deliver<Decoded>): Parsed<Decoded>;
}

/* Explicitly imposing that, for custom Transcoders, output format from deserialization must match input format to serialization. */
export interface Struct<Decoded, Context> {
    pack: Packer<Decoded, Context>;
    parse: Parser<Decoded, Context>;
}

/* Called by pack */
interface fetch_and_encode<D, E extends Encoded, C> {
    source: Fetcher<D | E> | D | E;
    encode?: Encoder<D, E, C>;
    context?: C;
}
const fetch_and_encode = <D, E extends Encoded, C>({ source, encode, context }: fetch_and_encode<D, E, C>): E => {
    let decoded;
    if ( typeof source === 'function' ) {
        decoded = source();
    } else {
        decoded = source as D | E;
    }
    if ( typeof encode === 'function' ) {
        return encode(decoded as D, context);
    } else {
        return decoded as E;
    }
};

/* Called by parse */
interface decode_and_deliver<E extends Encoded, D, C> {
    encoded: E | D;
    decode?: Decoder<E, D, C>;
    context?: C;
    deliver?: Deliver<D>;
}
const decode_and_deliver = <E extends Encoded, D, C>({ encoded, decode, context, deliver }: decode_and_deliver<E, D, C>): D => {
    let decoded;
    if ( typeof decode === 'function' ) {
        decoded = decode(encoded as E, context);
    } else {
        decoded = encoded as D;
    }
    if ( typeof deliver === 'function' ) {
        deliver(decoded);
    }
    return decoded;
};

const factory = <E extends number | string>(serializer: Serializer<E>, deserializer: Deserializer<E>, verify_size: (bits: number) => boolean) => {
    return ( <D, C>(bits: number, transcoders: Transcoders<E, D, C> = {}): Struct<D, C> => {
        if ( !verify_size(bits) ) {
            throw new Error(`Invalid size: ${bits}`);
        }
        const { encode, decode, little_endian: LE } = transcoders;

        const pack: Packer<D, C> = (source, options = {}) => {
            const { data_view = new DataView(new ArrayBuffer(Math.ceil(bits / 8))), byte_offset = 0, little_endian = LE, context } = options;
            const encoded = fetch_and_encode({ source, encode, context }) as E;
            const size = ( serializer(encoded, { bits, data_view, byte_offset, little_endian }) / 8 );
            return { size, buffer: data_view.buffer };
        };

        const parse: Parser<D, C> = (data_view, options = {}, deliver) => {
            const { byte_offset = 0, little_endian = LE, context } = options;
            const encoded = deserializer({ bits, data_view, byte_offset, little_endian });
            const data = decode_and_deliver({ encoded, context, decode, deliver }) as D;
            return { data, size: bits / 8 };
        };
        return { pack, parse };
    } );
};

export const Bits = factory(uint_pack, uint_parse, (s) => Bits_Sizes.includes(s));

export const Uint = factory(uint_pack, uint_parse, (s) => Uint_Sizes.includes(s));

export const Int = factory(int_pack, int_parse, (s) => Int_Sizes.includes(s));

export const Float = factory(float_pack, float_parse, (s) => Float_Sizes.includes(s));

export const Utf8 = factory(utf8_pack, utf8_parse, (s) => s % 8 === 0 && s >= 0);

export type Numeric<C> = number | { bits?: number, bytes?: number } | ((context?: C) => number);

const numeric = <C>(n: Numeric<C>, context?: C, type: 'b' | 'B' = 'B'): number => {
    if ( typeof n === 'object' ) {
        let { bits = 0, bytes = 0 } = n;
        n = type === 'B' ? bits / 8 + bytes : bits + bytes * 8;
    } else if ( typeof n === 'function' ) {
        n = n(context);
    } else if ( typeof n !== 'number' ) {
        throw new Error(`Invalid numeric input ${n}`);
    }
    if ( n < 0 ) {
        throw new Error(`Invalid size: ${n} bytes`);
    }
    return n;
};

/** Byte_Buffer doesn't do any serialization, but just copies bytes to/from an ArrayBuffer that's a subset of the
 * serialized buffer. Byte_Buffer only works on byte-aligned data.
 *
 * @param {Numeric} length
 * @param {Transcoders<ArrayBuffer, any>} transcoders
 */
export const Byte_Buffer = <D, C>(length: Numeric<C>, transcoders: Transcoders<ArrayBuffer, D, C> = {}) => {
    const { encode, decode } = transcoders;
    const pack = (source: D | Fetcher<D>, options: Pack_Options<C> = {}): Packed => {
        const { data_view, byte_offset = 0, context } = options;
        const size = numeric(length, context);
        const buffer = fetch_and_encode({ source, encode, context });
        if ( size !== buffer.byteLength ) {
            throw new Error(`Length miss-match. Expected length: ${size}, actual bytelength: ${buffer.byteLength}`)
        }
        if ( data_view === undefined ) {
            return { size, buffer }
        }
        new Uint8Array(buffer).forEach((value, index) => {
            data_view.setUint8(byte_offset + index, value);
        });
        return { size, buffer: data_view.buffer }
    };
    const parse = (data_view: DataView, options: Parse_Options<C> = {}, deliver?: Deliver<D>) => {
        const { byte_offset = 0, context } = options;
        const size = numeric(length, context);
        const buffer = data_view.buffer.slice(byte_offset, byte_offset + size);
        const data = decode_and_deliver({ encoded: buffer, context, decode, deliver });
        return { data, size };
    };
    return { pack, parse }
};

export const Padding = <C>(bits: Numeric<C>, transcoders: Transcoders<number, any, C> = {}): Struct<any, C> => {
    const { encode, decode } = transcoders;
    const pack: Packer<any, C> = (source, options = {}) => {
        let { data_view, byte_offset = 0, context } = options;
        const size = numeric(bits, context, 'b') as number;
        if ( data_view === undefined) {
            data_view = new DataView(new ArrayBuffer(Math.ceil(size / 8)));
        }
        if ( encode !== undefined ) {
            let fill: number = encode(null, options.context);
            let i = 0;
            while ( i < Math.floor(size / 8) ) {
                data_view.setUint8(byte_offset + i, fill);
                fill >>= 8;
                i++;
            }
            const remainder = size % 8;
            if ( remainder ) {
                data_view.setUint8(byte_offset + i, fill & ( 2 ** remainder - 1 ))
            }
        }
        return { size: size / 8, buffer: data_view.buffer }
    };
    const parse: Parser<any, C> = (data_view, options = {}, deliver) => {
        const { context } = options;
        const size = numeric(bits, context, 'b') as number;
        let data: any = null;
        if ( decode !== undefined ) {
            data = decode(data, context);
            if ( deliver !== undefined ) {
                deliver(data);
            }
        }
        return { size: size / 8, data };
    };
    return { pack, parse }
};

/* Allow Symbols once TypesScript adds support */
export type Chooser<C> = (context?: C) => number | string;

export interface Choices<D, C> {
    [choice: number]: Struct<D, C>;
    [choice: string]: Struct<D, C>;
}

export interface Branch<D, C> {
    chooser: Chooser<C>;
    choices: Choices<D, C>;
    default_choice?: Struct<D, C>;
}
export const Branch = <D, C>({ chooser, choices, default_choice }: Branch<D, C>): Struct<D, C> => {
    const choose = (source?: C): Struct<D, C> => {
        let choice = chooser(source);
        if ( choices.hasOwnProperty(choice) ) {
            return choices[choice];
        } else {
            if ( default_choice !== undefined ) {
                return default_choice;
            } else {
                throw new Error(`Choice ${choice} not in ${Object.keys(choices)}`);
            }
        }
    };
    const pack: Packer<D, C> = (source, options = {}) => {
        return choose(options.context).pack(source, options);
    };
    const parse: Parser<D, C> = (data_view, options = {}, deliver) => {
        return choose(options.context).parse(data_view, options, deliver);
    };
    return { parse, pack };
};

export const Embed = <D, C extends Context_Iterable<D, S>, S>(embedded: Struct<Context_Iterable<D, S>, S> | Struct<D, C>): Struct<Context_Iterable<D, S> | D, C> => {
    const pack = (source: Fetcher<D>, { byte_offset, data_view, little_endian, context }: Pack_Options<C> = {}): Packed => {
        if ( context !== undefined ) {
            const parent = context[Parent];
            if ( embedded instanceof Array ) {
                return ( embedded as Binary_Array<D, Context_Array<D, S>, S> )
                    .pack( context as Context_Array<D, S>, { byte_offset, data_view, little_endian, context: parent }, source);
            } else if ( embedded instanceof Map ) {
                return ( embedded as Binary_Map<D, Context_Map<D, S>, S> )
                    .pack(context as Context_Map<D, S>, { byte_offset, data_view, little_endian, context: parent }, context as Context_Map<D, S>);
            }
        }
        return ( embedded as Struct<D, C> ).pack(source, { byte_offset, data_view, little_endian, context });
    };
    const parse = (data_view: DataView, { byte_offset, little_endian, context }: Parse_Options<C> = {}, deliver?: Deliver<D>): Parsed<Context_Iterable<D, S> | D> => {
        if ( context !== undefined ) {
            const parent = context[Parent];
            if ( embedded instanceof Array ) {
                return ( embedded as Binary_Array<D, Context_Array<D, S>, S> )
                    .parse(data_view, { byte_offset, little_endian, context: parent }, undefined, context as Context_Array<D, S>);
            } else if ( embedded instanceof Map ) {
                return ( embedded as Binary_Map<D, Context_Map<D, S>, S> )
                    .parse(data_view, { byte_offset, little_endian, context: parent }, undefined, context as Context_Map<D, S>);
            }
        }
        return ( embedded as Struct<D, C> ).parse(data_view, { byte_offset, little_endian, context }, deliver);
    };
    return { pack, parse }
};

const concat_buffers = (packed: Packed[], byte_length: number) => {
    const data_view = new DataView(new ArrayBuffer(Math.ceil(byte_length)));
    let byte_offset = 0;
    for ( const { size, buffer } of packed ) {
        /* Copy all the data from the returned buffers into one grand buffer. */
        const bytes = Array.from(new Uint8Array(buffer as ArrayBuffer));
        /* Create a Byte Array with the appropriate number of Uint(8)s, possibly with a trailing Bits. */
        const array = Binary_Array();
        for ( let i = 0; i < Math.floor(size); i++ ) {
            array.push(Uint(8));
        }
        if ( size % 1 ) {
            array.push(Bits(( size % 1 ) * 8));
        }
        /* Pack the bytes into the buffer */
        array.pack(bytes, { data_view, byte_offset });
        byte_offset += size;
    }
    return data_view;
};

export type Map_Item<I> = Struct<I, Mapped<I>>;
export type Map_Iterable<I> = Array<[string, Map_Item<I>]>;
export type Map_Transcoders<I, D, C> = Transcoders<Mapped<I>, D, C>;

export interface Binary_Map<I, D, C> extends Mapped<Map_Item<I>>, Struct<D, C> {
    pack: (source: D | Fetcher<D>, options?: Pack_Options<C>, encoded?: Context_Map<I, C>) => Packed;
    parse: (data_view: DataView, options?: Parse_Options<C>, deliver?: Deliver<D>, results?: Context_Map<I, C>) => Parsed<D>;
}

export function Binary_Map<I, D, C>(transcoders: Map_Transcoders<I, D, C> | Map_Iterable<I> = {}, iterable?: Map_Iterable<I> | Map_Transcoders<I, D, C>) {
    if ( transcoders instanceof Array ) {
        [transcoders, iterable] = [iterable as Map_Transcoders<I, D, C>, transcoders as Map_Iterable<I>];
    }
    const { encode, decode, little_endian: LE } = transcoders;

    const map = new Map(( iterable || [] ) as Map_Iterable<I>) as Binary_Map<I, D, C>;

    map.pack = (source, options = {}, encoded) => {
        const packed: Packed[] = [];
        let { data_view, byte_offset = 0, little_endian = LE, context } = options;
        if ( encoded === undefined ) {
            encoded = fetch_and_encode({ source, encode, context });
            set_context(encoded, context);
        }
        /* Need to return a function to the `pack` chain to enable Embed with value checking. */
        const fetcher = (key: string) => () => {
            const value = encoded!.get(key);
            if ( value === undefined ) {
                throw new Error(`Insufficient data for serialization: ${key} not in ${encoded}`)
            }
            return value;
        };
        let offset = 0;
        for ( const [key, item] of map ) {
            const { size, buffer } = item.pack(fetcher(key), { data_view, byte_offset: data_view === undefined ? 0 : byte_offset + offset, little_endian, context: encoded });
            if ( data_view === undefined ) {
                packed.push({ size, buffer });
            }
            offset += size;
        }
        if ( data_view === undefined ) {
            data_view = concat_buffers(packed, offset);
        }
        return { size: offset, buffer: data_view.buffer };
    };

    map.parse = (data_view, options = {}, deliver, results) => {
        const { byte_offset = 0, little_endian = LE, context } = options;
        let remove_parent_symbol = false;
        if ( results === undefined ) {
            results = set_context(new Map() as Mapped<I>, context);
            remove_parent_symbol = true;
        }
        let offset = 0;
        for ( const [key, item] of map ) {
            const { data, size } = item.parse(data_view, { byte_offset: byte_offset + offset, little_endian, context: results }, (data) => results!.set(key, data));
            offset += size;
        }
        const data = decode_and_deliver<Mapped<I>, D, C>({ encoded: results, decode, context, deliver });
        remove_context(results, remove_parent_symbol);
        return { data, size: offset };
    };

    return map;
}

export namespace Binary_Map {
    export let object_encoder = (obj: any) => Map.fromObject(obj);
    export let object_decoder = (map: Map<any, any>) => map.toObject();
    export let object_transcoders = {encode: Binary_Map.object_encoder, decode: Binary_Map.object_decoder};
}

/* This would be much cleaner if JavaScript had interfaces. Or I could make everything subclass Struct... */
const extract_array_options = <Items, Transcoders>(elements: Array<Items | Transcoders> = []) => {
    if ( elements.length > 0 ) {
        const first = elements[0];
        if ( !first.hasOwnProperty('pack') && !first.hasOwnProperty('parse') ) {
            return elements.shift() as Transcoders;
        }
        const last = elements[elements.length - 1];
        if ( !last.hasOwnProperty('pack') && !last.hasOwnProperty('parse') ) {
            return elements.pop() as Transcoders;
        }
    }
    return {} as Transcoders;
};

export type Array_Item<I> = Struct<I, Array<I>>;
export type Array_Transcoders<I, D, C> = Transcoders<Array<I>, D, C>;

export interface Binary_Array<I, D, C> extends Array<Array_Item<I>>, Struct<D, C> {
    pack: (source: D | Fetcher<D>, options?: Pack_Options<C>, fetcher?: Fetcher<I>) => Packed;
    __pack_loop: (fetcher: Fetcher<I>, options: Pack_Options<Array<I>>, store: (result: Packed) => void, parent?: C) => number;
    parse: (data_view: DataView, options?: Parse_Options<C>, deliver?: Deliver<D>, results?: Context_Array<I, C>) => Parsed<D>;
    __parse_loop: (data_view: DataView, options: Parse_Options<Context_Array<I, C>>, deliver: Deliver<I>, parent?: C) => number;
}

export const Binary_Array = <I, D, C>(...elements: Array<Array_Transcoders<I, D, C> | Array_Item<I>>): Binary_Array<I, D, C> => {
    const { encode, decode, little_endian: LE } = extract_array_options(elements) as Array_Transcoders<I, D, C>;

    const array = new Array(...elements as Array<Array_Item<I>>) as Binary_Array<I, D, C>;

    array.pack = (source, options = {}, fetcher) => {
        let { data_view, byte_offset = 0, little_endian = LE, context } = options;
        const encoded = fetch_and_encode({ source, encode, context });
        const packed: Packed[] = [];
        if ( fetcher === undefined ) {
            set_context(encoded, context);
            const iterator = encoded[Symbol.iterator]();
            fetcher = () => {
                const value = iterator.next().value;
                if ( value === undefined ) {
                    throw new Error(`Insufficient data for serialization: ${encoded}`)
                }
                return value;
            }
        }
        const store = (result: Packed) => {
            if ( data_view === undefined ) {
                packed.push(result);
            }
        };
        const size = array.__pack_loop(fetcher, { data_view, byte_offset, little_endian, context: encoded }, store, context);
        if ( data_view === undefined ) {
            data_view = concat_buffers(packed, size);
        }
        return { size, buffer: data_view.buffer };
    };

    array.__pack_loop = (fetcher, { data_view, byte_offset = 0, little_endian, context }, store) => {
        let offset = 0;
        for ( const item of array ) {
            const { size, buffer } = item.pack(fetcher, { data_view, byte_offset: data_view === undefined ? 0 : byte_offset + offset, little_endian, context });
            store({ size, buffer });
            offset += size;
        }
        return offset;
    };

    array.parse = (data_view, options = {}, deliver, results) => {
        const { byte_offset = 0, little_endian = LE, context } = options;
        let remove_parent_symbol = false;
        if ( results === undefined ) {
            results = set_context(new Array() as Array<I>, context);
            remove_parent_symbol = true;
        }
        const size = array.__parse_loop(data_view, { byte_offset, little_endian, context: results }, (data: I) => results!.push(data), context);
        const data = decode_and_deliver({ encoded: remove_context(results, remove_parent_symbol), context, decode, deliver });
        return { data, size };
    };

    array.__parse_loop = (data_view, { byte_offset = 0, little_endian, context }, deliver) => {
        let offset = 0;
        for ( const item of array ) {
            const { data, size } = item.parse(data_view, { byte_offset: byte_offset + offset, little_endian, context }, deliver);
            offset += size;
        }
        return offset;
    };

    return array;
};

export interface Repeat_Options<I, D, C> extends Array_Transcoders<I, D, C> {
    count?: Numeric<C>;
    bytes?: Numeric<C>;
}

export const Repeat = <I, D, C>(...elements: Array<Repeat_Options<I, D, C> | Array_Item<I>>): Binary_Array<I, D, C> => {
    const { count, bytes, encode, decode, little_endian } = extract_array_options(elements) as Repeat_Options<I, D, C>;

    const array = Binary_Array<I, D, C>({ encode, decode, little_endian }, ...elements as Array<Array_Item<I>>);

    const pack_loop = array.__pack_loop;
    const parse_loop = array.__parse_loop;

    array.__pack_loop = (fetcher, { data_view, byte_offset = 0, little_endian, context }, store, parent) => {
        let offset = 0;
        if ( count !== undefined ) {
            const repeat = numeric(count, parent);
            for ( let i = 0; i < repeat; i++ ) {
                offset += pack_loop(fetcher, { data_view, byte_offset: byte_offset + offset, little_endian, context }, store);
            }
        } else if ( bytes !== undefined ) {
            const repeat = numeric(bytes, parent);
            while ( offset < repeat ) {
                offset += pack_loop(fetcher, { data_view, byte_offset: byte_offset + offset, little_endian, context }, store);
            }
            if ( offset > repeat ) {
                throw new Error(`Cannot pack into ${repeat} bytes.`);
            }
        } else {
            throw new Error("One of count or bytes must specified in options.")
        }
        return offset;
    };

    array.__parse_loop = (data_view, { byte_offset = 0, little_endian, context }, deliver, parent) => {
        let offset = 0;
        if ( count !== undefined ) {
            const repeat = numeric(count, parent);
            for ( let i = 0; i < repeat; i++ ) {
                offset += parse_loop(data_view, { byte_offset: byte_offset + offset, little_endian, context }, deliver);
            }
        } else if ( bytes !== undefined ) {
            const repeat = numeric(bytes, parent);
            while ( offset < repeat ) {
                offset += parse_loop(data_view, { byte_offset: byte_offset + offset, little_endian, context }, deliver);
            }
            if ( offset > repeat ) {
                throw new Error(`Cannot parse exactly ${repeat} bytes.`);
            }
        } else {
            throw new Error("One of count or bytes must specified in options.")
        }
        return offset;
    };

    return array;
};
