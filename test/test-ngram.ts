import {Document,Index,DocumentSet, DocumentIndex, LetterIndex} from "../src/ngram.js";
import * as assert from "assert";

function echo(...args:any[]){
    console.log(...args);
}
export async function main(){
    let d=new Document("A","abcc deff adc eedef abc");
    let s=new DocumentSet();
    s.addDocument(d);
    let scale="";
    for(let i=0;i<d.content.length;i++){
        scale+=(i%10);
    }
    echo(scale, d.content.length);
    echo(d.content);
    //traverse(s.root);
    /*for(let i=0;i<15;i++){
        echo(s.expand());
        s.calcCount();
        for(let word of allSubstr(d.content)){
            //echo(word);
            find(s,word);
        }
    }*/
    //traverse(s.root);
    //allWords(s.root);
    //await predict(s);
    //predictWord(s,d);
    //let {index,found,rest}=s.findIndex("bc");
    //this.echo(index.keyType,found,rest);
    //traverse.call(this,index);
    find(s,"ab");
    find(s,"bc");
    find(s,"def");
    //for(let s of allSubstr("abc"))echo(s);
}    
main();

function q(c:any){
    return `'${c}'`;
}
function allWords(idx: Index,ctx=""){
    if(idx instanceof DocumentIndex){
        for(let [doc, offsets] of idx.map){
            echo(q(ctx),doc,offsets.join(" "));
        }
    }else{
        for(let [chr, sidx] of idx.map){
            allWords(sidx,ctx+chr);
        }
    }
}
function* allSubstr(s:string){
    for(let i=0;i<s.length;i++){
        for(let j=i+1;j<=s.length;j++){
            yield s.substring(i,j);
        }
    }
}
function traverse(idx:Index){
    let p=(...a:any[])=>{
        echo(...a);
    };
    p("{");
    if (idx instanceof DocumentIndex) {
        for(let [k,v] of idx.map){
            p(q(k),v);
            p(",");
        }    
    } else {
        for(let [k,v] of idx.map){
            if(v instanceof LetterIndex){
                p(q(k)+": ");
                traverse(v);
            }else{
                p(k, v);
            }
            p(",");
        }        
    }
    p("}");
}
function find(ds:DocumentSet,word:string){
    let r=new Set();
    for(let {document,offset} of ds.find(word)){
        //echo(word,document.path,offset);
        assert.ok(document.looks(offset,word),
        [word,document.path,offset].join(","));
        r.add(`${document}:${offset}`);
    }
    for (let e of r) echo(word+": "+e);
    let offset=0, found=0;
    for(let [p,d] of ds.path2doc){
        while(true){
            let i=d.content.indexOf(word,offset);
            if(i<0)return ;
            offset=i;
            assert.ok(r.has(`${d}:${offset}`),
            `no ${d}:${offset}`);
            offset++;
            found++;
        }
    }
    assert.equal(r.size, found);
}
async function predict(ds:DocumentSet){
    for(let [p,d] of ds.path2doc){
        for(let i=1;i<d.content.length;i++){
            echo("predict",d.content.substring(i-5,i),"...");
            for(let [k,v] of await ds.predictLetter(d,i)){
                echo(`'${k}'(${v}) `,{n:1});
            }
            echo(" ");
        }
    }
}

function predictWord(ds:DocumentSet,d:Document){
    for(let w of ds.predictWord(d,1)){
        echo("pw",w.pre,w.post);
    }
}
