import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";

export interface PreviewElement {
  id: string;
  tag: string;
  text: string;
  start: number;
  end: number;
  editable: boolean;
}

type Node = DefaultTreeAdapterMap["node"];

export function inspectHtml(source: string) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const elements: PreviewElement[] = [];
  function walk(node: Node) {
    if ("tagName" in node && node.sourceCodeLocation?.startTag && node.sourceCodeLocation.endTag) {
      const loc = node.sourceCodeLocation;
      const startTag = loc.startTag;
      if (!startTag) return;
      const children = node.childNodes;
      const text = children
        .filter((child) => "value" in child)
        .map((child) => ("value" in child ? child.value : ""))
        .join("");
      const id = `forja-${elements.length}`;
      node.attrs = node.attrs.filter((attr) => attr.name !== "data-forja-id");
      node.attrs.push({ name: "data-forja-id", value: id });
      elements.push({
        id,
        tag: node.tagName,
        text,
        start: startTag.endOffset,
        end: loc.endTag?.startOffset ?? loc.endOffset,
        editable:
          children.every((child) => child.nodeName === "#text") &&
          !["script", "style", "textarea", "title"].includes(node.tagName),
      });
    }
    if ("childNodes" in node) node.childNodes.forEach(walk);
  }
  document.childNodes.forEach(walk);
  return { html: serialize(document), elements };
}

export function replaceElementText(source: string, id: string, text: string) {
  const element = inspectHtml(source).elements.find((item) => item.id === id);
  if (!element?.editable)
    throw new Error("Este elemento contiene otros elementos; pedile el cambio a la IA.");
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return source.slice(0, element.start) + escaped + source.slice(element.end);
}

export function resolvePreviewPath(base: string, reference: string): string | null {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) return null;
  const parts = reference.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of (reference.split(/[?#]/)[0] ?? "").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

// Only our bridge runs in local static previews. User code never shares the IDE origin.
export function bridgeScript(token: string, color: string) {
  return `<script>(()=>{
    const token=${JSON.stringify(token)}, color=${JSON.stringify(color)};
    let mode='browse', selected=null;
    const emit=(data)=>parent.postMessage({forjaPreview:token,...data},'*');
    addEventListener('message',event=>{if(event.source!==parent||event.data?.forjaPreview!==token)return; mode=event.data.mode; document.body.style.cursor=mode==='browse'?'auto':'crosshair';});
    document.addEventListener('click',event=>{
      const el=event.target.closest('[data-forja-id]');
      if(mode==='browse'){if(event.target.closest('a'))event.preventDefault();return;}
      event.preventDefault(); event.stopPropagation();
      if(!el)return;
      if(selected){selected.style.outline='';selected.style.outlineOffset='';}
      selected=el; el.style.outline='2px solid '+color;el.style.outlineOffset='2px';
      emit({type:'selection',id:el.dataset.forjaId,text:el.innerText,tag:el.tagName.toLowerCase()});
    },true);
    document.addEventListener('keydown',event=>{
      if(!(event.ctrlKey||event.metaKey)||event.target.closest('input,textarea,[contenteditable=true]'))return;
      if(['z','y'].includes(event.key.toLowerCase())){event.preventDefault();emit({type:event.shiftKey||event.key.toLowerCase()==='y'?'redo':'undo'});}
    },true);
    for(const action of ['copy','cut','paste'])document.addEventListener(action,event=>{
      if(mode==='browse'||!selected||event.target.closest('input,textarea,[contenteditable=true]'))return;
      if(action==='copy'||action==='cut'){
        event.clipboardData?.setData('text/plain',selected.textContent||'');event.preventDefault();
        if(action==='cut')emit({type:'clipboard',id:selected.dataset.forjaId,text:''});
      }else{
        event.preventDefault();emit({type:'clipboard',id:selected.dataset.forjaId,text:event.clipboardData?.getData('text/plain')||''});
      }
    });
    document.addEventListener('submit',event=>event.preventDefault(),true);
    emit({type:'ready'});
  })()<${"/"}script>`;
}
