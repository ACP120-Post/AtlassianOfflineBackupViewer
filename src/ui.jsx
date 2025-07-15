import React,{useState,useEffect} from 'react';
import Spinner from '@atlaskit/spinner';
import InfoIcon from '@atlaskit/icon/core/information';
import {t} from './i18n.jsx';
export function useResource(url) {
  const [state,setState]=useState({url:null,data:null,error:null});
  useEffect(()=>{if(!url)return;const controller=new AbortController();
    fetch(url,{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(t(data.error)||t('Data could not be loaded'));return data;})
      .then(data=>setState({url,data,error:null})).catch(e=>{if(e.name!=='AbortError')setState({url,data:null,error:e.message});});
    return ()=>controller.abort();},[url]);
  return state.url===url?{...state,loading:false}:{data:null,error:null,loading:!!url};
}
export function Loading({text=t('Loading content …')}) {return <div className="loading" role="status"><Spinner size="medium"/><span>{text}</span></div>;}
export function Message({title,children,error=false}) {return <div className={`message ${error?'error':''}`} role={error?'alert':undefined}><span className="ui-icon"><InfoIcon label={t('Information')}/></span><div><strong>{title}</strong>{children&&<div>{children}</div>}</div></div>;}
export function State({resource,children}) {return resource.loading?<Loading/>:resource.error?<Message title={t('Cannot load')} error>{resource.error}</Message>:children;}
export function Html({html}) {return <div className="storage-content" dangerouslySetInnerHTML={{__html:html||''}}/>;}
