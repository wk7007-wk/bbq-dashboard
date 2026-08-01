(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PosDelayAdReceipt=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  var STORAGE_KEY='posdelay_baemin_ad_receipts_v1';
  var LOG_LIMIT=6;

  function parseKstTimestamp(value){
    if(typeof value==='number')return value<10000000000?value*1000:value;
    var text=String(value||'').trim();
    if(!text)return 0;
    if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text))text=text.replace(' ','T')+'+09:00';
    var parsed=Date.parse(text);
    return Number.isFinite(parsed)?parsed:0;
  }

  function actionLabel(action,target){
    var label=action==='max'?'최대':action==='mid'?'중간':action==='min'?'최소':'배민 광고';
    return label+' '+Number(target).toLocaleString('ko-KR')+'원';
  }

  function clockLabel(value){
    try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));}
    catch(e){return new Date(value).toISOString().slice(11,19);}
  }

  function safeText(value,limit){
    return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit||120);
  }

  function readLog(storage){
    try{
      var parsed=JSON.parse(storage&&storage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(parsed)?parsed.slice(-LOG_LIMIT):[];
    }catch(e){return [];}
  }

  function writeLog(storage,rows){
    try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify(rows.slice(-LOG_LIMIT)));}catch(e){}
  }

  function hasValidBaseline(snapshot){
    if(!snapshot||typeof snapshot!=='object')return false;
    var rawBid=snapshot.baemin_current_bid;
    return parseKstTimestamp(snapshot.time)>0&&Object.prototype.hasOwnProperty.call(snapshot,'last_ad_action')&&
      rawBid!==null&&rawBid!==undefined&&rawBid!==''&&Number.isFinite(Number(rawBid));
  }

  function createReceiptController(options){
    options=options||{};
    var now=options.now||function(){return Date.now();};
    var hasBridge=options.hasBridge||function(){return false;};
    var setTimer=options.setTimer||setTimeout;
    var clearTimer=options.clearTimer||clearTimeout;
    var timeoutMs=Number(options.timeoutMs)||50000;
    var storage=options.storage||null;
    var onChange=typeof options.onChange==='function'?options.onChange:function(){};
    var rows=readLog(storage),active=null,timer=null,sequence=0,readback={};
    var state=hasBridge()
      ?{state:'readback_wait',label:'적용 상태 읽는 중',detail:'현재 광고 상태를 확인한 뒤 실행 버튼이 열립니다.',at:now()}
      :{state:'app_only',label:'앱에서만 실행',detail:'공개 웹에서는 광고 동작을 만들지 않습니다.',at:now()};

    function copy(value){return JSON.parse(JSON.stringify(value));}
    function emit(){onChange(copy(state),copy(rows));}
    function append(next){
      rows.push({requestId:next.requestId||'',state:next.state,action:next.action||'',target:Number.isFinite(next.target)?next.target:null,at:next.at,detail:safeText(next.detail,120)});
      rows=rows.slice(-LOG_LIMIT);writeLog(storage,rows);
    }
    function update(next,record){
      state=next;if(record)append(next);emit();
    }
    function stopTimer(){if(timer){clearTimer(timer);timer=null;}}
    function finish(nextState,detail){
      if(!active)return;
      var request=active;active=null;stopTimer();
      update({state:nextState,label:(nextState==='applied'?'적용됨':'확인 필요')+' · '+actionLabel(request.action,request.target),detail:safeText(detail,160),at:now(),requestId:request.id,action:request.action,target:request.target},true);
    }
    function request(action,target,invoke){
      target=Number(target);
      if(!hasBridge()){
        update({state:'app_only',label:'앱에서만 실행',detail:'공개 웹에서는 광고 동작을 만들지 않습니다.',at:now(),action:action,target:target},true);
        return false;
      }
      if(!hasValidBaseline(readback)){
        update({state:'readback_wait',label:'적용 상태 읽는 중',detail:'현재 광고 상태 확인 전에는 요청을 보내지 않습니다.',at:now(),action:action,target:target},true);
        return false;
      }
      if(active){
        state.detail='이미 '+actionLabel(active.action,active.target)+' 요청을 확인 중입니다. 중복 요청은 보내지 않았습니다.';
        emit();return false;
      }
      if(!Number.isFinite(target)||target<0){
        update({state:'needs_check',label:'확인 필요 · 배민 광고',detail:'요청 금액을 확인할 수 없어 앱에 전달하지 않았습니다.',at:now(),action:action,target:null},true);
        return false;
      }
      var issuedAt=now();
      active={id:'baemin-ad-'+issuedAt+'-'+(++sequence),action:action,target:target,issuedAt:issuedAt,baselineTime:String(readback.time||''),baselineAction:String(readback.last_ad_action||''),baselineReady:hasValidBaseline(readback)};
      update({state:'pending',label:'요청 중 · '+actionLabel(action,target),detail:'앱에 전달했습니다. 실제 광고 상태 확인을 기다립니다.',at:issuedAt,requestId:active.id,action:action,target:target},true);
      timer=setTimer(function(){finish('needs_check','정해진 시간 안에 확인되지 않음 · 앱의 광고 상태를 확인해 주세요.');},timeoutMs);
      try{
        if(typeof invoke!=='function')throw new Error('bridge unavailable');
        invoke('BAEMIN_SET_AMOUNT',target);
        return true;
      }catch(e){
        finish('needs_check','앱 전달 실패 · 다시 시도하기 전에 앱 연결을 확인해 주세요.');
        return false;
      }
    }
    function observe(snapshot){
      readback=snapshot&&typeof snapshot==='object'?Object.assign({},snapshot):{};
      if(!active){
        if(hasBridge()&&hasValidBaseline(readback)&&state.state==='readback_wait'){
          update({state:'idle',label:'실행 준비됨',detail:'현재 적용 상태를 읽었습니다. 실행 후 실제 결과를 다시 확인합니다.',at:now()},false);
        }
        return;
      }
      var evidenceTime=String(readback.time||''),lastAction=String(readback.last_ad_action||'');
      if(!active.baselineReady){
        if(hasValidBaseline(readback)){active.baselineTime=evidenceTime;active.baselineAction=lastAction;active.baselineReady=true;}
        return;
      }
      var evidenceAt=parseKstTimestamp(evidenceTime),issuedSecond=Math.floor(active.issuedAt/1000)*1000;
      var newTime=!!evidenceTime&&evidenceTime!==active.baselineTime&&evidenceAt>=issuedSecond;
      var newAction=!!lastAction&&lastAction!==active.baselineAction;
      if(!newTime||!newAction)return;
      if(/실패|오류|시간\s*초과|ERR_|차단/.test(lastAction)){
        finish('needs_check','실패 응답 · '+safeText(lastAction,100));return;
      }
      var rawBid=readback.baemin_current_bid;
      var bid=rawBid===null||rawBid===undefined||rawBid===''?NaN:Number(rawBid);
      var exactTarget=new RegExp('(^|[^0-9])'+String(active.target)+'\\s*원([^0-9]|$)').test(lastAction);
      var exactAction=lastAction.indexOf('배민 광고 금액')>=0&&exactTarget&&lastAction.indexOf('변경')>=0;
      if(bid===active.target&&exactAction){
        finish('applied','서버 readback '+clockLabel(evidenceAt)+' · 금액과 완료 응답 일치');
      }else{
        finish('needs_check','응답 불일치 · 요청 '+active.target+'원 / 확인 '+(Number.isFinite(bid)?bid+'원':'금액 없음'));
      }
    }
    function getState(){return copy(state);}
    function getLog(){return copy(rows);}
    function destroy(){stopTimer();active=null;}
    return {request:request,observe:observe,getState:getState,getLog:getLog,destroy:destroy,emit:emit};
  }

  function mount(options){
    options=options||{};
    var root=options.root||document;
    var panel=root.getElementById('baeminAdReceipt');
    var status=root.getElementById('baeminAdReceiptStatus');
    var detail=root.getElementById('baeminAdReceiptDetail');
    var log=root.getElementById('baeminAdReceiptLog');
    var buttons=Array.prototype.slice.call(root.querySelectorAll('[data-baemin-ad-action]'));
    function render(next,rows){
      if(panel)panel.setAttribute('data-state',next.state);
      if(status)status.textContent=next.label;
      if(detail)detail.textContent=next.detail;
      buttons.forEach(function(button){var disabled=next.state==='pending'||next.state==='readback_wait';button.disabled=disabled;button.setAttribute('aria-disabled',disabled?'true':'false');});
      if(log){
        while(log.firstChild)log.removeChild(log.firstChild);
        if(!rows.length){var empty=root.createElement('li');empty.textContent='기록 없음';log.appendChild(empty);}
        rows.slice().reverse().forEach(function(row){
          var item=root.createElement('li');
          item.textContent=clockLabel(row.at)+' · '+(row.state==='applied'?'적용됨':row.state==='pending'?'요청 중':row.state==='readback_wait'?'상태 읽는 중':row.state==='app_only'?'앱 전용':'확인 필요')+(row.target!=null?' · '+row.target+'원':'');
          log.appendChild(item);
        });
      }
    }
    var controller=createReceiptController({
      now:options.now,
      hasBridge:options.hasBridge,
      storage:options.storage,
      timeoutMs:options.timeoutMs,
      setTimer:options.setTimer,
      clearTimer:options.clearTimer,
      onChange:render
    });
    render(controller.getState(),controller.getLog());
    return controller;
  }

  return {createReceiptController:createReceiptController,mount:mount,parseKstTimestamp:parseKstTimestamp,STORAGE_KEY:STORAGE_KEY};
});
