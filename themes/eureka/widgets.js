'use strict';

module.exports = function ({Widget}) {
  class EurekaPostMarkdown extends Widget {
    async execute() {
      const {post} = this.parameter;
      let markdown = '';
      // Keep locked posts and attachment fallbacks out of the download path.
      if (post && (post.type === 0 || post.type === '0') && !post.password_protected) {
        if (Object.hasOwn(post, 'markdown_content')) {
          // Previews already carry the editor's source, even when it is empty.
          markdown = post.markdown_content || '';
        } else if (post.id) {
          const source = await this.model('post')
            .where({id: post.id})
            .field('markdown_content')
            .setRelation(false)
            .find();
          markdown = source?.markdown_content || '';
        }
      }
      this.push({markdown});
    }
  }

  return {
    Widget_Eureka_PostMarkdown: EurekaPostMarkdown,
    Widget_Eureka_SayComments: require('./say-comments')
  };
};
