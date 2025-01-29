// @hoge1e3/ngram
import * as assert from "assert";
import {Counter} from "@hoge1e3/counter";
import { DefaultMap } from "@hoge1e3/default-map";
import { off } from "process";
class T_EOF {
    toString(){return "<EOF>";}
}
//export const EOF=new T_EOF;
type Letter=string;//|T_EOF;
export type Index=DocumentIndex|LetterIndex;
export type PredictWordResult={
    // ex.  typed 'wo' and predicted 'rd' -> pre:'wo', post: 'rd',
    pre:string,  // Already typed word part
    post:string, // predicted word part
};
export type PredictLetterResult=[string,number];
export type DocumentOffset={
    document: Document,
    offset: number,
};
type Result=DocumentOffset&{
    prefix: string,
    //eof: boolean,
};
type WalkResult={
    index:Index,
    found:string,
    rest:string,
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
        //if(offset==this.content.length)return EOF;
        if (offset<0||offset>=this.content.length) throw new Error("Index out of bounds "+offset);
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
        this.root=new LetterIndex(undefined);
        this.path2doc=new Map();
    }
    public find(word: string):Generator<DocumentOffset>{
        return this.root.find(word);
    }
    // return next letter candidates with relevance
    public predictLetter(doc:Document, offset:number): PredictLetterResult[] {
        return this.root.predictLetter(doc,offset);
    }
    public predictWord(doc:Document, offset:number): Generator<PredictWordResult> {
        return this.root.predictWord(doc,offset);
    }
    public addDocument(doc: Document):void{
        let old=this.path2doc.get(doc.path);
        if(old){
            this.deleteDocument(old);
        }
        this.path2doc.set(doc.path,doc);
        for(let i=0;i<doc.content.length;i++){
            this.root.add(doc,i);
        }
    }
    public deleteDocument(doc: Document):void {
        for(let i=0;i<doc.content.length;i++){
            this.root.delete(doc,i);
        }
    }
}
// Document and its offsets followed by 'the string'.
//  'the string' is determined by parent paths(LetterIndexes) of this index.
// DocumentIndex is the leaf of the index tree
export class DocumentIndex{
    map=new DefaultMap<Document , number[]>(()=>[],true);
    count: number=0;
    constructor (
        public parent:LetterIndex, 
        public letter:Letter) {}
    add(doc:Document, offset:number){
        const map=this.map;
        const offsets=map.get(doc);
        assert.ok(offset>=0 && offset<doc.content.length, 
            doc+":"+offset+" invalid offset");
        offsets.push(offset);
        this.count++;
        if (this.count>thresh) {
            this.expand();
        }
    }
    delete(doc:Document, offset:number){
        const map=this.map;
        let offsets=map.get(doc);
        const i=offsets.findIndex((o)=>offset===o);
        if (i<0) throw new Error("Index not found");
        offsets.splice(i,1);
        this.count--;
        if (offsets.length==0) map.delete(doc);
    }
    expand(){
        const nli=new LetterIndex(this.parent);
        for(let [doc, offsets] of this.map){
            for (let o of offsets){
                nli.add(doc,o);
            }
        }
        nli.count=this.count;
        this.parent.map.set(this.letter, nli);
    }
    *words(prefix=""):Generator<string>{
        yield prefix;
    }
    walk(word:string): WalkResult{
        return {
            index:this,
            found:"",
            rest:word,
        };
    }
    *results(prefix=""):Generator<Result> {
        for(let [document, offsets] of this.map){
            for(let offset of offsets){
                yield {
                    document,
                    offset,
                    prefix,
                };
            }
        }
    }
}
// Candidates of following letters, followed by 'the string'.
//  'the string' is determined by parent paths(LetterIndexes) of this index.
// LetterIndex is the non-leaf node of the index tree.
export class LetterIndex {
    map=new Map<Letter , Index>();
    count: number=0;
    constructor (public parent?:LetterIndex) {}
    add(doc:Document, offset:number){
        const le=doc.at(offset);
        let nextIdx=this.map.get(le);
        if(!nextIdx){
            const didx=new DocumentIndex(this, le);
            nextIdx=didx;
            this.map.set(le,didx);
            //if(le==EOF) didx.isEof=true;
        }
        this.count++;
        if (offset+1>=doc.content.length) {
            return;
        }
        nextIdx.add(doc, offset+1);
    }
    delete(doc:Document, offset:number){
        const le=doc.at(offset);
        let nextIdx=this.map.get(le);
        if(!nextIdx){
            return;
        }
        this.count--;
        if (offset+1>=doc.content.length) {
            return;
        }
        nextIdx.delete(doc, offset+1);
    }
    *words(prefix=""):Generator<string>{
        const letters=[
            ...this.map
        ].filter(
            ([letter,index])=>isAlpha(letter)
        ).map(
            ([letter,index])=>({
                letter,
                count:index.count,
                index
            })
        ).sort(
            ({count:a},{count:b})=>b-a
        );
        for(let {letter,index} of letters){
            yield* index.words(prefix+letter);
        }
    }
    /* example:
        `word`="something" 
        when the index tree indexes to "some" 
        `index` points at the DocumentIndex, that is leaf node of Root-'s'-'o'-'m'-'e'
        `found` is "some"
        `rest` is "thing"

        when the index tree indexes to "something"
        `index` points at the LetterIndex 
        `found` is "something"
        `rest` is ""
    */
    walk(word:string):WalkResult{
        // found+rest=word
        // index is LetterIndex && rest => not found
        // index is DocumentIndex && rest => depends on index content
        // index is LetterIndex && !rest => found
        // index is DocumentIndex && !rest => found
        if (word==="") return {
            index:this,
            found:"",
            rest:"",
        };
        const nextIdx=this.map.get(word[0]);
        if(!nextIdx) return {
            // index is LetterIndex && rest => not found
            index:this,
            found:"",
            rest:word,
        };
        const r=nextIdx.walk(word.substring(1));
        // index is LetterIndex && !rest => found
        // index is DocumentIndex && !rest => found
        return {
            index: r.index, 
            found: word[0]+r.found,
            rest:  r.rest
        };
        /* DocumentIndex does:
        return {
            index:this,
            found:"",
            rest:word,
        };
        */
    }
    *find(word: string):Generator<DocumentOffset>{
        let {index,found,rest}=this.walk(word);
        // index is LetterIndex && rest => not found
        if(keyIsLetter(index)&&rest)return;
        if(!rest){
            // index is LetterIndex && !rest => found
            // index is DocumentIndex && !rest => found
            for(let {document,offset,prefix} of 
                index.results()){
                yield {
                    document,
                    offset:offset-
                        prefix.length-
                        found.length,
                };
            }
        }else{
            // index is DocumentIndex && rest => depends on index content
            for(let {document,offset} of index.results()){
                if(document.looks(offset,rest)){
                    yield {
                        document,
                        offset: offset-found.length,
                    };
                }
            }            
        }
    }
    // Iterate all result from specified `index`
    *results(prefix=""):Generator<Result>{
        for(let [letter,index] of this.map){
            yield* index.results(prefix+letter);
        }
    }

    predictLetter(doc:Document,offset:number): PredictLetterResult[]{
        let p=1;
        let c=new Counter<string>();
        while(offset-p>=0){
            let word=doc.content.substring(offset-p,offset);
            let {index,found,rest}=this.walk(word);
            if(rest) break ;
            if(keyIsDocument(index))break;
            let sc=p+1;//index.map.size;
            for(let [letter,idx] of index.map){
                let sc2=idx.count||1;
                c.set(letter,sc-1/sc2);
            }
            p++;
        }
        return c.descend();
    }
    *predictWord(doc:Document,offset:number):Generator<PredictWordResult> {
        if (offset>=doc.content.length) offset=doc.content.length-1;
        if (offset<0) return;
        const oo=offset;
        offset--;
        while(offset>=0&&isAlpha(doc.at(offset)))offset--;
        offset++;
        if(!isAlpha(doc.at(offset)))return ;
        const pre=doc.slice(offset,oo);
        const {index,found,rest}=this.walk(pre);
        for(let post of index.words()){
            yield {pre,post};
        }
    }    
}
function isAlpha(a:Letter){
    return typeof a==="string" && a.match(/^\w$/);
}
let thresh=10;
function keyIsDocument(idx:Index): idx is DocumentIndex{
    return idx instanceof DocumentIndex;
}
function keyIsLetter(idx:Index): idx is LetterIndex{
    return idx instanceof LetterIndex;
}

