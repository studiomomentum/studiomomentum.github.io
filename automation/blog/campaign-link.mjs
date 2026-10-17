const homepage='https://studiomomentum.github.io/';
export function campaignLink(platform,content='profile'){
  if(!['naver','tistory','threads'].includes(platform))throw Error('PLATFORM_INVALID');
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(content))throw Error('TRACKING_CONTENT_INVALID');
  const url=new URL(homepage);
  for(const [key,value] of Object.entries({utm_source:platform,utm_medium:'organic_social',utm_campaign:'professional_filming',utm_content:content}))url.searchParams.set(key,value);
  return url.href;
}
export function trackArticleLinks(outputs,topicId){
  if(!topicId)return outputs;
  for(const platform of ['naver','tistory']){
    if(!outputs[platform])continue;
    const link=campaignLink(platform,'topic_'+topicId);
    outputs[platform].body=outputs[platform].body.replace(/https:\/\/studiomomentum\.github\.io\/(?:\?[^\s<>\]）)"']*)?/g,link);
  }
  return outputs;
}
