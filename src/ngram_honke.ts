// @hoge1e3/ngram
import * as assert from "assert";
// This is naively typed from honke.js
import {Counter} from "@hoge1e3/counter";
import { DefaultMap } from "@hoge1e3/default-map";
class T_EOF {
    toString(){return "<EOF>";}
}
export const EOF=new T_EOF;
type Letter=string|T_EOF;
export type Index=DocumentIndex|LetterIndex;
// Candidates of following letters, followed by 'the string'.
//  'the string' is determined by parent paths(LetterIndexes) of this index.
// LetterIndex is the non-leaf node of the index tree.
export type LetterIndex={
    keyType:"letter",
    map:Map<Letter , Index>;
    count: number,
    parent?: LetterIndex,
};
// Document and its offsets followed by 'the string'.
//  'the string' is determined by parent paths(LetterIndexes) of this index.
// DocumentIndex is the leaf of the index tree
export type DocumentIndex={
    keyType:"doc",
    map:DefaultMap<Document , number[]>,
    count: number,
    parent: LetterIndex,
    letter: Letter, // letter on parent LetterIndex (=prev letter)
    //isEof:boolean,// Indicates parent LetterIndex is of EOF
};
type PredictWordResult={
    // ex.  typed 'wo' and predicted 'rd' -> pre:'wo', post: 'rd',
    pre:string,  // Already typed word part
    post:string, // predicted word part
};
type FindResult={
    document: Document,
    offset: number,
    prefix: string,
    eof: boolean
};
/**
 * Represents single document(genrally single file) for search.
 */
export class Document{
    timeStamp:number;
    deleted=false;
    constructor(public path:string ,public content:string ,timeStamp=0){
        this.timeStamp=timeStamp||Date.now();
    }
    at(offset: number):Letter{
        if(offset==this.content.length)return EOF;
        return this.content[offset];
    }
    slice(begin: number, end: number ){
        return this.content.substring(begin,end);
    }
    toString(){
        return this.path;
    }
    looks(at:number, word:string){
        return this.content.substring(at,at+word.length)==word;
    }
}
/**
 * Set of document with index tree
 */
export class DocumentSet{
    root: LetterIndex;
    //rank: RankedList<DocumentIndex>;
    path2doc: Map<string, Document>;
    constructor (){
        this.root=createLetterIndex(undefined);
        /*this.rank=new RankedList({
            rankOf(didx: DocumentIndex){
                let c=1;
                for(let [doc, offsets] of didx.map){
                    c+=offsets.length;
                }
                return Math.floor(Math.log(c));
            }
        });*/
        this.path2doc=new Map();
    }
    public find(word: string){
        return find(word,this.root);
    }
    // return next letter candidates with relevance
    public async predictLetter(doc:Document, offset:number): Promise<[string,number][]> {
        return await predictLetter(doc,offset,this.root);
    }
    public predictWord(doc:Document, offset:number): Generator<PredictWordResult> {
        return predictWord(doc,offset,this.root);
    }
    public addDocument(doc: Document){
        let old=this.path2doc.get(doc.path);
        if(old){
            old.deleted=true;
        }
        this.path2doc.set(doc.path,doc);
        for(let i=0;i<doc.content.length;i++){
            this.addAt(this.root,doc,i);
        }
    }
    
    expand(didx:DocumentIndex){
        /*this.rank.updateAll();
        const didx=this.rank.pick();
        if(!didx)return ;*/
        return this.toLetterIndex(didx);
    }
    calcCount(idx?: Index){
        idx=idx||this.root;
        let c=0;
        if(keyIsDocument(idx)){
            for(let [doc, offsets] of idx.map){
                c+=offsets.length;
            }
        }else if(keyIsLetter(idx)){
            for(let [chr, sidx] of idx.map){
                c+=this.calcCount(sidx);
            }
        }
        idx.count=c;
        return c;
    }
    addLetter(lidx: LetterIndex, doc:Document,offset:number){
        const le=doc.at(offset);
        if(le==null)return ;
        let idx=lidx.map.get(le);
        if(!idx){
            const didx=createDocumentIndex(lidx, le);
            idx=didx;
            lidx.map.set(le,didx);
            //if(le==EOF) didx.isEof=true;
        }
        this.addAt(idx,doc,offset+1);
    }
    /*private addDoc(didx: DocumentIndex, doc: Document, offset: number){
        //if(!didx.isEof)this.rank.requestUpdate(didx);
        let map=didx.map;
        let offsets=map.get(doc);
        if(!offsets){
            offsets=[];
            map.set(doc,offsets);
        }
        assert.ok(didx.isEof||
        offset<=doc.content.length,
        doc+":"+offset+" invalid offset");
        assert.ok(!didx.isEof||
        offset==doc.content.length+1,
        doc+":"+offset+" invalid eof offset");
        offsets.push(offset);
        if (this.calcCount(didx)>thresh) {
            this.expand(didx);
        }
    }*/
    private addAt(_idx:Index, doc: Document,offset:number){
        let cidx=_idx;
        const path=[] as Index[];
        while(true) {
            path.push(cidx);
            if(keyIsLetter(cidx)){
                const le=doc.at(offset);
                if(le==null)return ;
                let nidx=cidx.map.get(le);
                if(!nidx){
                    const didx=createDocumentIndex(cidx, le);
                    nidx=didx;
                    cidx.map.set(le,didx);
                    //if(ch==EOF) didx.isEof=true;
                }
                cidx=nidx;
           }else{
                const didx=cidx;
                let map=didx.map;
                let offsets=map.get(doc);
                assert.ok(didx.letter===EOF||
                offset<=doc.content.length,
                doc+":"+offset+" invalid offset");
                assert.ok(!didx.letter===EOF||
                offset==doc.content.length+1,
                doc+":"+offset+" invalid eof offset");
                offsets.push(offset);
                if (this.calcCount(didx)>thresh) {
                    this.expand(didx);
                }
                cidx=didx;
            }
        }
    }
    toLetterIndex(didx: DocumentIndex){
        if(didx.letter===EOF)return ;
        const nli=createLetterIndex(didx.parent);
        //let nmap=new Map<Letter,Index>();
        let c=0;
        for(let [doc, offsets] of didx.map){
            for (let o of offsets){
                this.addLetter(nli,doc,o);
                c++;
            }
        }
        //this.rank.remove(didx);
        didx.parent.map.set(didx.letter, nli);
        //mutateToLetterIndex(didx, nmap);
        return c;
    }
}
type FindIndexResult={
    index:Index,
    found:string,
    rest:string,
};
/* example:
  `word`="something" 
  when a position of document is indexed to "some" 
  `index` points at the DocumentIndex, that is leaf node of Root-'s'-'o'-'m'-'e'
  `found` is "some"
  `rest` is "thing"

  when a position of document is indexed to "something"
  `index` points at the LetterIndex 
  `found` is "something"
  `rest` is ""

*/
function findIndex(word:string ,idx: Index): FindIndexResult{
    // index is LetterIndex && rest => not found
    // index is DocumentIndex && rest => depends on index content
    // index is LetterIndex && !rest => found
    // index is DocumentIndex && !rest => found
    let i:number;
    for(i=0;i<word.length;i++){
        if(keyIsDocument(idx)){
            // index is DocumentIndex && rest => depends on index content
            break;
        }
        const _idx=idx.map.get(word[i]);
        if(!_idx)return {
            // index is LetterIndex && rest => not found
            index:idx,
            found:word.substring(0,i),
            rest:word.substring(i),
        };
        idx=_idx;
    }
    // (unless break;ed)
    // index is LetterIndex && !rest => found
    // index is DocumentIndex && !rest => found
    return {
        index:idx,
        found:word.substring(0,i),
        rest:word.substring(i),
    };
}
// Iterate all result from specified `index`
function *resultsFrom(index: Index,prefix=""):Generator<FindResult>{
    if(keyIsDocument(index)){
        for(let [document, offsets] of index.map){
            for(let offset of offsets){
                yield {
                    document,
                    offset,
                    prefix,
                    eof:index.letter===EOF,
                };
            }
        }
    }else{
        for(let [le,idx] of index.map){
            yield* resultsFrom(idx,prefix+(le===EOF?"":le));
        }
    }
}
function *find(word: string, rootidx:LetterIndex){
    let {index,found,rest}=findIndex(word,rootidx);
    if(keyIsLetter(index)&&rest)return ;
    if(!rest){
        for(let {document,offset,prefix,eof} of 
        resultsFrom(index)){
            yield {
                document,
                offset:offset-
                    prefix.length-
                    found.length-
                    (eof?1:0),
            };
        }
    }else{
        for(let {document,offset,prefix} of 
        resultsFrom(index)){
            if(document.looks(offset,rest)){
                yield {
                    document,
                    offset: offset-found.length,
                };
            }
        }            
    }
}
async function predictLetter(doc:Document,offset:number,rootidx:LetterIndex): Promise<[string,number][]>{
    let p=1;
    let c=new Counter<string>();
    while(offset-p>=0){
        let word=doc.content.substring(offset-p,offset);
        let {index,found,rest}=findIndex(word,rootidx);
        if(rest)break ;
        if(keyIsDocument(index))break;
        let sc=p+1;//index.map.size;
        for(let [ch,idx] of index.map){
            if(ch instanceof T_EOF)continue;
            let sc2=idx.count||1;
            c.set(ch,sc-1/sc2);
        }
        p++;
    }
    return c.descend();
}
function isAlpha(a:Letter){
    return typeof a==="string" && a.match(/^\w$/);
}
function *predictWord(doc:Document,offset:number,rootidx:LetterIndex):Generator<PredictWordResult> {
    let oo=offset;
    offset--;
    while(offset>=0&&isAlpha(doc.at(offset)))offset--;
    offset++;
    if(!isAlpha(doc.at(offset)))return ;
    let pre=doc.slice(offset,oo);
    //console.log("pw",pre);
    let {index,found,rest}=findIndex(pre,rootidx);
    //console.log("pwr",rest);
    for(let w of traverseWords(index)){
        //console.log("pww",pre,w);
        yield {
            pre,
            post: w
        };
    }
    
}
function* traverseWords(idx: Index,prefix=""):Generator<string>{
    if(keyIsDocument(idx)){
        yield prefix;return ;
    }
    let ls=[...idx.map].
    map(([ch,i])=>({ch,c:i.count,idx:i})).
    filter(({ch})=>isAlpha(ch)).
    sort(({c:a},{c:b})=>b-a);
    for(let {ch,idx} of ls){
        yield* traverseWords(idx,prefix+ch);
    }
}
let thresh=10;


function createDocumentIndex(parent:LetterIndex, letter:Letter):DocumentIndex {
    return {
        keyType:"doc",
        map: new DefaultMap<Document , number[]>(()=>[], true),
        //isEof: false,
        parent,letter, 
        count:0,
    }
}
function createLetterIndex(parent?:LetterIndex):LetterIndex {
    return {
        keyType:"letter",
        map: new Map<Letter , Index>(),
        count:0,
        parent,
    }
}
function keyIsDocument(idx:Index): idx is DocumentIndex{
    return idx.keyType=="doc";
}
function keyIsLetter(idx:Index): idx is LetterIndex{
    return idx.keyType=="letter";
}
function mutateToLetterIndex(didx: DocumentIndex, nmap: Map<Letter, Index>):LetterIndex {
    const lidx=didx as Index as LetterIndex;
    lidx.keyType="letter";
    lidx.map=nmap;
    return lidx;
}


/*class RankedList<I>{
    rankOf:(item:I)=>number;
    byRank: (Set<I>|null)[];
    rerank: Set<I>;
    constructor ({rankOf}:{rankOf:(item:I)=>number}){
        this.rankOf=rankOf;
        this.byRank=[];
        this.rerank=new Set<I>();
    }
    updateAll(){
        for(let item of this.rerank){
            this.add(item);
        }
        this.rerank=new Set();
    }
    requestUpdate(item: I){
        if(this.rerank.has(item))return ;
        this.remove(item);
        this.rerank.add(item);
    }
    add(item: I){
        let r=this.rankOf(item);
        let b=this.byRank;
        b[r]=b[r]||new Set();
        b[r].add(item);
    }
    remove(item: I){
        let r=this.rankOf(item);
        let b=this.byRank;
        b[r]=b[r]||new Set();
        b[r].delete(item);
    }
    pick(){
        let b=this.byRank;
        for(let i=b.length-1;i>=0;i--){
            const bi=b[i];
            if(!bi||bi.size==0){
                b[i]=null;
                if(i==b.length-1)b.length=i;
                continue;
            }
            for(let e of bi){
                bi.delete(e);
                return e;
            }
        }
    }
}*/