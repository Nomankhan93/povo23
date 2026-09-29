export async function rpc(name,args) {
  if(name!=='field_operations_map_page')throw Error(name);
  window.mapCalls.push({...args});
  if(window.denyMap)throw Error('Project field map access required');
  const n=args.p_cursor_id?2:1;
  const row={id:'survey:'+n,layer:'survey',source_id:'response-'+n,source_kind:'response',source_context_id:'response-'+n,source_openable:true,source_label:'Evidence '+n,project_id:'project',project_title:'Project',worker_id:'alice',worker_name:'Alice',geography_id:'area',geography_name:'Area',status:'submitted',latitude:25,longitude:67,accuracy_m:10,captured_at:'2026-09-28T10:00:00Z',received_at:'2026-09-28T10:00:00Z',quality:'within_assigned_area',warning_codes:[],review_required:false};
  return {rows:[row],boundaries:[],summary:{matched_total:2,plottable:2,within_assigned_area:2},pagination:{has_more:n===1,next_cursor:n===1?{captured_at:row.captured_at,id:row.id}:null},facets:{workers:[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}],geographies:[{id:'area',name:'Area'}],statuses:['submitted']}};
}
