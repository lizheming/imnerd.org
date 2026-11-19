const path = require('node:path');
const View = require('think-view-eta');
const theme = path.resolve(__dirname, '../themes/eureka');
function render({identity = {loggedIn:false, canPublish:false}, items = [], page = 1, total = 21, list, missing = false} = {}) {
  const site = {row:{}, themeConfig:{}, title:()=> '测试博客', keywords:()=>'', description:()=>'', navigation:[], siteUrl:'https://example.com', themeUrl:p=>'/theme/eureka/'+p};
  const archive = {next(){}, have:()=>true, title:()=> '微博', permalink:'/page/says.html'};
  const data = {ctx:{query:{page},url:'/page/says.html?page='+page}, currentYear:2026, pagination:{currentPage:1,totalPages:1},
    widget:async name => name === 'Widget_Options' ? site : name === 'Widget_Custom_SaySession' ? {stack:[identity]} : archive,
    plugin: missing ? {} : {say:{list:list || (async args => ({items,page:Number(args.page)||1,pageSize:10,total}))}}};
  return new View(path.join(theme, 'template/says.eta'), data, {viewPath:theme, options:{varName:'firekylin'}}).render();
}
module.exports = {render};
