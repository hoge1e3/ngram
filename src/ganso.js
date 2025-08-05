// @hoge1e3/ngram
// ganso is working on current acepad
import * as assert from "assert";
import {Counter} from "@hoge1e3/counter";
import {sleep} from "@hoge1e3/timeout";
export const EOF="eof";
export class Document{
    constructor(path,content,timeStamp){
        this.path=path;
        this.timeStamp=timeStamp||Date.now();
        this.content=content;
        this.deleted=false;
    }
    at(offset){
        if(offset==this.content.length)return EOF;
        return this.content[offset];
    }
    slice(b,e){
        return this.content.substring(b,e);
    }
    toString(){
        return this.path;
    }
    looks(at,word){
        return this.content.substring(at,at+word.length)==word;
    }
}
export class DocumentSet{
    constructor (){
        this.root=this.LetterIndex();
        this.rank=new RankedList({
            rankOf(didx){
                let c=1;
                for(let [doc, offsets] of didx.map){
                    c+=offsets.length;
                }
                return Math.floor(Math.log(c));
            }
        });
        this.path2doc=new Map();
    }
    addDocument(doc){
        let old=this.path2doc.get(doc.path);
        if(old){
            old.deleted=true;
        }
        this.path2doc.set(doc.path,doc);
        for(let i=0;i<doc.content.length;i++){
            this.add(this.root,doc,i);
        }
    }
    find(word){
        return find(word,this.root);
    }
    async predict(doc,offset){
        return await predict(doc,offset,this.root);
    }
    predictWord(doc,offset){
        return predictWord(doc,offset,this.root);
    }
    expand(){
        this.rank.updateAll();
        let didx=this.rank.pick();
        if(!didx)return ;
        return this.toLetterIndex(didx);
    }
    calcCount(idx){
        idx=idx||this.root;
        let c=0;
        if(keyIsDocument(idx)){
            for(let [doc, offsets] of idx.map){
                c+=offsets.length;
            }
        }else{
            for(let [chr, sidx] of idx.map){
                c+=this.calcCount(sidx);
            }
        }
        idx.count=c;
        return c;
    }

    //private
    LetterIndex(){
        let lidx=new Index("chr");
        return lidx;
    }
    DocumentIndex(){
        let didx=new Index("doc");
        return didx;
    }
    addChr(map,doc,offset){
        let ch=doc.at(offset);
        if(ch==null)return ;
        let idx=map.get(ch);
        if(!idx){
            idx=this.DocumentIndex();
            map.set(ch,idx);
            if(ch==EOF)idx.isEof=true;
        }
        this.add(idx,doc,offset+1);
    }
    addDoc(didx,doc,offset){
        if(!didx.isEof)this.rank.requestUpdate(didx);
        let map=didx.map;
        let offsets=map.get(doc);
        if(!offsets){
            offsets=[];
            map.set(doc,offsets);
        }
        /*assert.ok(didx.isEof||
        offset<=doc.content.length,
        doc+":"+offset+" invalid offset");
        assert.ok(!didx.isEof||
        offset==doc.content.length+1,
        doc+":"+offset+" invalid eof offset");*/
        
        offsets.push(offset);
    }
    add(idx,doc,offset){
        if(keyIsLetter(idx)){
            this.addChr(idx.map,doc,offset);
        }else{
            this.addDoc(idx,doc,offset);
        }
    }
    toLetterIndex(didx){
        if(didx.isEof)return ;
        let nmap=new Map();
        let c=0;
        for(let [doc, offsets] of didx.map){
            for (let o of offsets){
                this.addChr(nmap,doc,o);
                c++;
            }
        }
        this.rank.remove(didx);
        didx.map=nmap;
        didx.keyType="chr";
        return c;
    }
}
function findIndex(word,idx){
    // index is LetterIndex && rest => not found
    // index is DocumentIndex && rest => depends on index content
    // index is LetterIndex && !rest => found
    // index is DocumentIndex && !rest => found
    let i;
    for(i=0;i<word.length;i++){
        let _idx=idx.map.get(word[i]);
        if(!_idx)return {
            index:idx,
            found:word.substring(0,i),
            rest:word.substring(i),
        };
        idx=_idx;
        if(keyIsDocument(idx)){
            i++;
            break;
        }
    }
    return {
        index:idx,
        found:word.substring(0,i),
        rest:word.substring(i),
    };
}
function *resultsFrom(index,prefix=""){
    if(keyIsDocument(index)){
        for(let [d,os] of index.map){
            for(let o of os){
                yield {
                    document:d,
                    offset:o,
                    prefix,
                    eof:index.isEof
                };
            }
        }
    }else{
        for(let [ch,idx] of index.map){
            yield* resultsFrom(idx,prefix+(ch===EOF?"":ch));
        }
    }
}
function *find(word,rootidx){
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
async function predict(doc,offset,rootidx){
    let p=1;
    let c=new Counter();
    while(offset-p>=0){
        let word=doc.content.substring(offset-p,offset);
        let {index,found,rest}=findIndex(word,rootidx);
        if(rest)break ;
        if(keyIsDocument(index))break;
        let sc=p+1;//index.map.size;
        for(let [ch,i] of index.map){
            if(ch===EOF)continue;
            let sc2=index.map.get(ch).count||1;
            c.set(ch,sc-1/sc2);
        }
        p++;
    }
    return c.descend();
}
function isAlpha(a){
    return a.match(/^\w$/);
}
function *predictWord(doc,offset,rootidx){
    let oo=offset;
    offset--;
    while(offset>=0&&isAlpha(doc.at(offset)))offset--;
    offset++;
    if(!isAlpha(doc.at(offset)))return ;
    let pre=doc.slice(offset,oo);
    console.log("pw",pre);
    let {index,found,rest}=findIndex(pre,rootidx);
    console.log("pwr",rest);
    for(let w of traverseWords(index)){
        console.log("pww",pre,w);
        yield {
            pre,
            post: w
        };
    }
    
}
function* traverseWords(idx,prefix=""){
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
function keyIsDocument(idx){
    return idx.keyType=="doc";
}
function keyIsLetter(idx){
    return idx.keyType=="chr";
}
class RankedList{
    constructor ({rankOf}){
        this.rankOf=rankOf;
        this.byRank=[];
        this.rerank=new Set();
    }
    updateAll(){
        for(let item of this.rerank){
            this.add(item);
        }
        this.rerank=new Set();
    }
    requestUpdate(item){
        if(this.rerank.has(item))return ;
        this.remove(item);
        this.rerank.add(item);
    }
    add(item){
        let r=this.rankOf(item);
        let b=this.byRank;
        b[r]=b[r]||new Set();
        b[r].add(item);
    }
    remove(item){
        let r=this.rankOf(item);
        let b=this.byRank;
        b[r]=b[r]||new Set();
        b[r].delete(item);
    }
    pick(){
        let b=this.byRank;
        for(let i=b.length-1;i>=0;i--){
            if(!b[i]||b[i].size==0){
                b[i]=null;
                if(i==b.length-1)b.length=i;
                continue;
            }
            for(let e of b[i]){
                b[i].delete(e);
                return e;
            }
        }
    }
}
class Index{
    constructor(keyType){
        this.keyType=keyType;
        this.map=new Map();    
    }
}
