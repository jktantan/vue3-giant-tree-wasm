<script setup lang="ts">
import '@lib/assets/style/index.scss'
import VueGiantTree from '@lib/VueGiantTree.vue'

import { nanoid } from 'nanoid'
import { ref } from 'vue'

const testData: { id: string; parentId: string; name: string }[] = []
const rootId = nanoid()
const pid = rootId
const result = ref([])
for (let i = 0; i < 10; i++) {
  const id1 = nanoid()
  testData.push({ id: id1, parentId: rootId, name: id1 })

  for (let j = 0; j < 10; j++) {
    const id2 = nanoid()
    testData.push({ id: id2, parentId: id1, name: id2 })

    for (let z = 0; z < 10; z++) {
      const id3 = nanoid()
      testData.push({ id: id3, parentId: id2, name: id3 })
    }
  }
}
</script>

<template>
  <!--  <div>-->
  <!--    <a href="https://vite.dev" target="_blank">-->
  <!--      <img src="/vite.svg" class="logo" alt="Vite logo" />-->
  <!--    </a>-->
  <!--    <a href="https://vuejs.org/" target="_blank">-->
  <!--      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />-->
  <!--    </a>-->
  <!--  </div>-->
  <!--  <HelloWorld msg="Vite + Vue" />-->
  <div style="width: 300px; height: 500px">
    <VueGiantTree :tree="testData" :root="pid" v-model="result" />
  </div>
  {{ result }}
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
