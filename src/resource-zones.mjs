// IDs identify a resource namespace, not a role. Trust only engine path fields.
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
export const noteResourceId=id=>typeof id==='string'&&UUID.test(id)?'note:'+id.toLowerCase():null;
export const announcementResourceId=id=>typeof id==='string'&&UUID.test(id)?'announcement:'+id.toLowerCase():null;
export function classifyRequestResource(r) {
  if(!r||typeof r.subjectId!=='string'||!r.subjectId
    ||typeof r.deviceId!=='string'||!/^[a-f0-9]{16}$/u.test(r.deviceId)
    ||typeof r.path!=='string'||typeof r.route!=='string'
    ||typeof r.method!=='string'||r.queryLength!==0)return null;
  const {path,route,method,service}=r;
  if(service==='notes'){
    for(const prefix of ['/notes','/api/notes']){
      if(path===prefix&&route===method+' '+prefix&&['GET','POST'].includes(method))
        return {zone:'note',resourceId:'note:collection',action:method};
      if(!path.startsWith(prefix+'/'))continue;
      const id=path.slice(prefix.length+1);
      const fixture=prefix==='/notes'&&id==='demo'&&r.signals?.source==='judge_fixture';
      const rid=noteResourceId(id)??(fixture?'note:fixture-demo':null);
      if(rid&&route===method+' '+prefix+'/:id'&&['GET','PUT','DELETE'].includes(method))
        return {zone:'note',resourceId:rid,action:method};
    }
  }
  if(service==='announcements'){
    for(const prefix of ['/announcements','/api/announcements']){
      if(!path.startsWith(prefix+'/'))continue;
      const rid=announcementResourceId(path.slice(prefix.length+1));
      if(rid&&route===method+' '+prefix+'/:id'&&['GET','PUT','DELETE'].includes(method))
        return {zone:'announcement',resourceId:rid,action:method};
    }
  }
  return null;
}
