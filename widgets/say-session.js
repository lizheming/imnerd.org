'use strict';

// Use the same signed backend session and CSRF proof as native plugin forms.
module.exports = ({Widget}) => class extends Widget {
  async execute() {
    this.ctx.set('Cache-Control', 'private, no-store');
    this.ctx.vary?.('Cookie');
    const guest = {loggedIn: false, canPublish: false, csrf: ''};
    if (!this.ctx.cookie('thinkjs')) { this.push(guest); return }
    const auth = require('firekylin/src/service/admin-auth');
    const options = await this.model('options').getOptions(true);
    this.ctx.state.jwtSecret ||= options.jwt_secret || options.comment_jwt_secret;
    const session = auth.currentUser(this.ctx);
    if (!session) { this.push(guest); return }
    const user = await this.model('user').where({id: session.id}).field('id,type,status').find();
    if (!user?.id || Number(user.status) !== 1) { this.push(guest); return }
    const canPublish = Number(session.type) === 1 && Number(user.type) === 1;
    const identity = {loggedIn: true, canPublish, csrf: canPublish ? auth.csrfToken(this.ctx) : ''};
    // Never trust a template parameter as authorization to read private posts.
    if (canPublish && this.parameter.includeList) {
      try {
        const {SayService} = require('firekylin-plugin-say/lib/say-service');
        const say = new SayService({getModel: name => this.model(name)});
        const settings = await say.settings();
        if (settings.enabled) {
          const items = (await say.all()).filter(item => ['public', 'private'].includes(item.status));
          const pageSize = 10;
          const lastPage = Math.max(1, Math.ceil(items.length / pageSize));
          const page = Math.min(lastPage, Math.max(1, Number.parseInt(this.ctx.query.page, 10) || 1));
          identity.list = {page, pageSize, total: items.length, items: items.slice((page - 1) * pageSize, page * pageSize)};
        }
      } catch { identity.listUnavailable = true; }
    }
    this.push(identity);
  }
};
