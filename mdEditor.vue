// src/components/MdEditor.vue
<template>
  <div ref="editorContainer" class="obsidian-md-editor"></div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onBeforeUnmount, ref } from 'vue';
import Vditor from 'vditor';
import { App, TFile } from 'obsidian';

export default defineComponent({
  name: 'MdEditor',
  props: {
    app: { type: Object as () => App, required: true }, // Obsidian App 实例 [[0]](#__0)
    currentFile: { type: Object as () => TFile, required: true } // 当前编辑的文件 [[0]](#__0)
  },
  setup(props) {
    const editorContainer = ref<HTMLElement | null>(null);
    let vditorInstance: Vditor | null = null;

    // 初始化编辑器
    const initEditor = async () => {
      if (!editorContainer.value) return;

      // 从 Obsidian 读取文件内容 [[0]](#__0)
      const content = await props.app.vault.read(props.currentFile);

      vditorInstance = new Vditor(editorContainer.value, {
        mode: 'wysiwyg',
        value: content,
        cache: { enable: false },
        after: () => {
          // 内容变化时同步到 Obsidian 文件 [[0]](#__0)
          vditorInstance?.setValue(content);
        },
        input: (newContent) => {
          // 防抖保存（300ms）
          debounceSave(newContent);
        },
        theme: document.body.hasClass('theme-dark') ? 'dark' : 'classic' // 适配暗黑模式 [[1]](#__1)
      });
    };

    // 防抖保存函数
    let saveTimeout: number;
    const debounceSave = (content: string) => {
      clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(() => {
        props.app.vault.modify(props.currentFile, content); // 写入文件 [[0]](#__0)
      }, 300);
    };

    onMounted(initEditor);
    onBeforeUnmount(() => {
      vditorInstance?.destroy();
    });

    return { editorContainer };
  }
});
</script>

<style scoped>
/* 样式隔离 */
.obsidian-md-editor {
  height: 200px;
  :deep(.vditor) {
    background: var(--background-primary);
    color: var(--text-normal);
  }
}
</style>
