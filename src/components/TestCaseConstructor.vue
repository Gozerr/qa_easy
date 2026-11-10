<script setup>
import { computed, ref } from 'vue'
import { Check, Plus, Trash2 } from '@lucide/vue'
import { useProgress } from '../composables/useProgress.js'

const { progress, recordPracticeResult } = useProgress()
const categories = [
  { id: 'positive', title: 'Позитивный' },
  { id: 'negative', title: 'Негативный' },
  { id: 'boundary', title: 'Граничный' },
  { id: 'validation', title: 'Валидация' },
]
const cases = ref([])
const selectedCategory = ref('positive')
const scenario = ref('')
const expected = ref('')
const evaluated = ref(false)
const coveredCategories = computed(() => new Set(cases.value.map(({ category }) => category)))
const missingCategories = computed(() => categories.filter(({ id }) => !coveredCategories.value.has(id)))
const score = computed(() => Math.round(((categories.length - missingCategories.value.length) / categories.length) * 100))
const saved = computed(() => progress.practiceResults['case-constructor-registration']?.bestScore === 100)

function addCase() {
  const title = scenario.value.trim()
  const expectation = expected.value.trim()
  if (title.length < 5 || expectation.length < 5) return
  cases.value.push({ id: `${Date.now()}-${cases.value.length}`, category: selectedCategory.value, title, expected: expectation })
  scenario.value = ''
  expected.value = ''
  evaluated.value = false
}

function evaluateSet() {
  evaluated.value = true
  if (missingCategories.value.length === 0 && cases.value.length >= categories.length) {
    recordPracticeResult('case-constructor-registration', 100)
  }
}
</script>

<template>
  <section class="activity-card">
    <p class="eyebrow">TEST CASE CONSTRUCTOR · JUNIOR</p>
    <h2>Спроектируй проверки регистрации</h2>
    <p class="activity-prompt">Форма принимает email, пароль и подтверждение пароля. Добавь сценарии четырёх типов; для каждого задай условие и наблюдаемый ожидаемый результат.</p>

    <div class="activity-checklist" aria-label="Покрытие сценариев">
      <span v-for="category in categories" :key="category.id" :class="{ 'is-covered': coveredCategories.has(category.id) }"><Check v-if="coveredCategories.has(category.id)" :size="13" aria-hidden="true" />{{ category.title }}</span>
    </div>

    <div class="case-form">
      <label><span>Тип проверки</span><select v-model="selectedCategory"><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.title }}</option></select></label>
      <label><span>Условие или данные</span><input v-model="scenario" type="text" maxlength="180" placeholder="Например: email без символа @"></label>
      <label class="case-expected"><span>Ожидаемый результат</span><textarea v-model="expected" rows="2" maxlength="260" placeholder="Что должна показать или сохранить система?"></textarea></label>
      <button class="button button-quiet" type="button" :disabled="scenario.trim().length < 5 || expected.trim().length < 5" @click="addCase"><Plus :size="15" aria-hidden="true" /> Добавить кейс</button>
    </div>

    <ol v-if="cases.length" class="case-list">
      <li v-for="(item, index) in cases" :key="item.id"><span><strong>{{ index + 1 }}. {{ item.title }}</strong><small>{{ categories.find(({ id }) => id === item.category)?.title }} · {{ item.expected }}</small></span><button type="button" :aria-label="`Удалить кейс ${index + 1}`" @click="cases.splice(index, 1); evaluated = false"><Trash2 :size="15" aria-hidden="true" /></button></li>
    </ol>

    <div class="activity-actions"><button class="button button-primary" type="button" :disabled="cases.length === 0" @click="evaluateSet">Оценить покрытие</button><span>{{ cases.length }} {{ cases.length === 1 ? 'кейс' : 'кейсов' }}</span></div>
    <div v-if="evaluated" class="activity-feedback" :class="{ 'is-success': score === 100 }" role="status">
      <strong>{{ score === 100 ? 'Набор покрывает четыре обязательных класса проверок.' : `Покрытие: ${score}%. Добавь недостающие типы.` }}</strong>
      <p v-if="missingCategories.length">Не хватает: {{ missingCategories.map(({ title }) => title).join(', ') }}.</p>
      <p v-else>Проверь, что каждый результат можно однозначно увидеть в интерфейсе или данных.</p>
      <small v-if="saved">Полный набор уже сохранён на этом устройстве.</small>
    </div>
  </section>
</template>
